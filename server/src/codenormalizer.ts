import {ABAPFile, ABAPObject, MemoryFile, Registry, PrettyPrinter, Config, IRegistry, RulesRunner,applyEditList, IEdit} from "@abaplint/core";

const isIEdit = (o:IEdit|undefined): o is IEdit => !!o

interface FileDetails {
  file: ABAPFile
  reg: IRegistry
}

function parseAbapFile(
  name: string,
  abap: string
):FileDetails | undefined {
  const reg = new Registry().addFile(new MemoryFile(name, abap)).parse();
  const objects = [...reg.getObjects()].filter(ABAPObject.is);
  const file = objects[0]?.getABAPFiles()[0];
  if (file) {return {file, reg};};
  return;
}

const getConfig = ():Config => {
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
  const edits:IEdit[] = issues
    .map(a => a.getFix())
    .filter(isIEdit);
  if (edits.length) {
    const nonconflicting = removeOverlapping(edits);
    const changed = applyEditList(reg, nonconflicting);
    reg.parse();
    const needReapplying = !!changed.length && nonconflicting.length < edits.length;
    return needReapplying;
  }
  return false;
};

const applyRules = (f:FileDetails, config:Config) => {
  const objects = [...f.reg.getObjects()].filter(ABAPObject.is);;
  const obj = objects[0];
  if (obj?.getFiles().length !== 1) {return f;}
  for (const rule of config.getEnabledRules()) {
    let needtoApply = true;
    let count = 0;
    while (needtoApply) {
      needtoApply = count++ < 10 && applyRule(f.reg, obj, rule);
    };
  }
  const file = obj.getABAPFiles()[0] || f.file;
  return {...f, file};
};

let normalizer: (path: string, source: string) => Promise<string>;

export const getNormalizer = () => {
  if (!normalizer) {
    const config = getConfig();
    normalizer = async (path: string, source: string) => {
      const name = path.replace(/.*\//, "");
      const f = parseAbapFile(name, source);
      if (f) {
        const fixed = await applyRules(f, config);
        const result = new PrettyPrinter(fixed.file, config).run();
        if (result) {return result;};
      }
      throw new Error(`Abaplint formatting failed for ${path}`);
    };
  }
  return normalizer;
};