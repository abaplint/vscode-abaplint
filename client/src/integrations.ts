import {extensions, Uri} from "vscode";
import {ABAPFile, ABAPObject, MemoryFile, Registry, PrettyPrinter, Config, IRegistry, RulesRunner, applyEditList, IConfig} from "@abaplint/core";

const ATLASCODEDIFF = "atlascode.bbpr";
interface CodeNormalizer {
    isRelevant: (u: Uri) => boolean;
    normalize: (code: string, uri: Uri) => Promise<string>;
}

interface BitBucketApi {
    registerCodeNormalizer:(n:CodeNormalizer)=>Disposable;
}

interface FileDetails {
  file: ABAPFile
  reg: IRegistry
}

export function parseAbapFile(
  name: string,
  abap: string
):FileDetails | undefined {
  const reg = new Registry().addFile(new MemoryFile(name, abap)).parse();
  const objects = [...reg.getObjects()].filter(ABAPObject.is);
  const file = objects[0]?.getABAPFiles()[0];
  if (file) {return {file, reg};};
  return;
}

const getConfig = async ():Promise<Config> => {
  const rules = {
    align_pseudo_comments:{
      exclude: [],
      severity: "Error",
    },
    align_parameters:{
      exclude: [],
      severity: "Error",
    },
    align_type_expressions:{
      exclude: [],
      severity: "Error",
    },
    in_statement_indentation:{
      exclude: [],
      severity: "Error",
      blockStatements: 2,
      ignoreExceptions: true,
    },
    sequential_blank: {
      lines: 4,
    },
    contains_tab:{
      exclude: [],
      severity: "Error",
      spaces: 1,
    },
    indentation:{
      exclude: [],
      severity: "Error",
      ignoreExceptions: true,
      alignTryCatch: false,
      selectionScreenBlockIndentation: false,
      globalClassSkipFirst: false,
      ignoreGlobalClassDefinition: false,
      ignoreGlobalInterface: false,
    },
    keyword_case: {
      style: "lower",
      ignoreExceptions: true,
      ignoreLowerClassImplmentationStatement: true,
      ignoreGlobalClassDefinition: false,
      ignoreGlobalInterface: false,
      ignoreFunctionModuleName: false,
    },
  };
  return new Config(JSON.stringify({rules}));
};

const applyRules = (f:FileDetails, config:Config) => {
  const objects = [...f.reg.getObjects()].filter(ABAPObject.is);;
  const obj = objects[0];
  console.assert(obj && objects.length === 1 && obj.getFiles().length === 1);
  for (const rule of config.getEnabledRules()) {
    rule.initialize(f.reg);
    const issues = new RulesRunner(f.reg).excludeIssues([...rule.run(obj)]);
    const edits = issues.map(a => a.getDefaultFix()).filter(e => typeof e !== "undefined");  // TODO: check overlaps
    if (edits.length) {
      const changed = applyEditList(f.reg, edits);
      if (changed) {console.log(changed);};
      f.reg.parse();
    }
  }
  const file = obj.getABAPFiles()[0] || f.file;
  return {...f, file};
};

const abapLintPrettyPrint = async (path: string, source: string) => {
  const name = path.replace(/.*\//, "");
  const f = parseAbapFile(name, source);
  if (f) {
    const config = await getConfig();
    const fixed = await applyRules(f, config);
    console.log(fixed);
    const result = new PrettyPrinter(fixed.file, config).run();
    if (result) {return result;};
  }
  throw new Error(`Abaplint formatting failed for ${path}`);
};

const shouldNormalize = (u:Uri) => {
  try {
    const o = JSON.parse(u.query);
    return !! o.normalized;
  } catch (error) {
    return false;
  }
};

const extractname = (u:Uri) => {
  if (u.scheme !== ATLASCODEDIFF) {return u.path;}
  try {
    const details = JSON.parse(u.query);
    if (details.path && typeof details.path === "string") {
      return details.path;
    }
  } catch (error) {
    return u.fragment;
  }
};

const norm = ():CodeNormalizer => {
  return {
    isRelevant:(u) => !!(u.fsPath.match(/\.abap$/) || u.fragment.match(/\.abap$/)),
    normalize:async (code, uri) => {
      if (!shouldNormalize(uri)) {
        return code;
      }
      const name = extractname(uri);
      return abapLintPrettyPrint(name, code);
    },
  };
};

export const registerBitbucket = async () => {
  const ext = extensions.getExtension<BitBucketApi>("atlassian.atlascode");
  if (!ext) {
    return;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  ext.exports.registerCodeNormalizer(norm());
};
