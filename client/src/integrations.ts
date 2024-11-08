import {extensions, Uri, workspace} from "vscode";
import {ABAPFile, ABAPObject, MemoryFile, Registry, PrettyPrinter, Config} from "@abaplint/core";

const ATLASCODEDIFF = "atlascode.bbpr";
interface CodeNormalizer {
    isRelevant: (u: Uri) => boolean;
    normalize: (code: string, uri: Uri) => Promise<string>;
}

interface BitBucketApi {
    registerCodeNormalizer:(n:CodeNormalizer)=>Disposable;
}
export function parseAbapFile(
  name: string,
  abap: string
): ABAPFile | undefined {
  const reg = new Registry().addFile(new MemoryFile(name, abap)).parse();
  const objects = [...reg.getObjects()].filter(ABAPObject.is);
  return objects[0]?.getABAPFiles()[0];
}

const getConfig = async ():Promise<Config> => {
  const cfgfile = [...await workspace.findFiles("abaplint.json"), ...await workspace.findFiles("abaplint.json[c5]")];
  console.log(cfgfile);
  for (const c of cfgfile) {
    try {
      const file = await workspace.fs.readFile(c);
      return new Config(file.toString());
    } catch (error) {
      console.log(error);
    }
  }
  return Config.getDefault();
};

const abapLintPrettyPrint = async (path: string, source: string) => {
  const name = path.replace(/.*\//, "");
  const f = parseAbapFile(name, source);
  const result = f && new PrettyPrinter(f, await  getConfig()).run();
  if (source && !result) {
    throw new Error(`Abaplint formatting failed for ${path}`);
  }
  return result || source;
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
