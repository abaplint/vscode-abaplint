import {extensions, Uri} from "vscode";
import {ABAPFile, ABAPObject, MemoryFile, Registry, PrettyPrinter, Config, IRegistry, RulesRunner, applyEditList, IEdit} from "@abaplint/core";

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

const HasOverlaps = (edit1:IEdit, edit2:IEdit) => {
  const files1 = new Set(Object.keys(edit1));
  for (const file of Object.keys(edit2).filter(x => files1.has(x))) {
    for (const filedit1 of edit1[file]) {
      for (const filedit2 of edit2[file]) {
        if (filedit2.range.start.getRow() <= filedit1.range.start.getRow()
            && filedit2.range.end.getRow() >= filedit1.range.start.getRow()) {
          return true;
        }
        if (filedit2.range.start.getRow() <= filedit1.range.end.getRow()
            && filedit2.range.end.getRow() >= filedit1.range.end.getRow()) {
          return true;
        }
      }
    }
  }
  return false;
};


const removeOverlapping = (edits:IEdit[]) => {
  return  edits.filter((ed, i) => {
    if (i <= 0) {return true;}
    for (let idx = 0; idx < i; idx++) {
      if (HasOverlaps(ed, edits[idx])) {return false;}
    }
    return true;
  });
};

type IRule  = ReturnType<Config["getEnabledRules"]>[0] // expose hidden IRule interface
const applyRule = (reg:IRegistry, obj:ABAPObject, rule:IRule) => {
  rule.initialize(reg);
  const issues = new RulesRunner(reg).excludeIssues([...rule.run(obj)]);
  const edits = issues
    .map(a => a.getDefaultFix())
    .filter(e => typeof e !== "undefined");
  if (edits.length) {
    const nonconflicting = removeOverlapping(edits);
    const changed = applyEditList(reg, nonconflicting);
    reg.parse();
    console.log(`${rule.getMetadata().title} ${nonconflicting.length} ${edits.length}`);
    const needReapplying = !!changed.length && nonconflicting.length < edits.length;
    return needReapplying;
  }
  return false;
};

const applyRules = (f:FileDetails, config:Config) => {
  const objects = [...f.reg.getObjects()].filter(ABAPObject.is);;
  const obj = objects[0];
  console.assert(obj && objects.length === 1 && obj.getFiles().length === 1);
  for (const rule of config.getEnabledRules()) {
    let needtoApply = true;
    let count = 0;
    while (needtoApply) {
      needtoApply = applyRule(f.reg, obj, rule);
      if (count++ > 0) {console.log(`${count} ${rule.getMetadata().title}`);};
    };
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
