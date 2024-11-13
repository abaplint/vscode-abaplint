import {extensions, Uri, workspace} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient";

const ATLASCODEDIFF = "atlascode.bbpr";
interface CodeNormalizer {
    isRelevant: (u: Uri) => boolean;
    normalize: (code: string, uri: Uri) => Promise<string>;
}

interface BitBucketApi {
    registerCodeNormalizer:(n:CodeNormalizer)=>Disposable;
}

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
const normalizations = ["On by default", "Off by default", "deactivated"] as const;
type Normalization<I extends number> = (typeof normalizations[I]);
const getNormalization = <I extends number>(): Normalization<I> => {
  const n = workspace.getConfiguration("abaplint").get("codeNormalization") as any;
  if (normalizations.includes(n)) {return n;}
  return  "Off by default";
};
const isAbap = (u:Uri) => !!(u.fsPath.match(/\.abap$/) || u.fragment.match(/\.abap$/));
const norm = (client: BaseLanguageClient):CodeNormalizer => {
  const normalization = getNormalization();
  const inverted = normalization === "On by default";
  const inactive = normalization === "deactivated";
  return {
    isRelevant:(u) => !inactive && isAbap(u),
    normalize:async (source, uri) => {
      if (inactive || !isAbap(uri) || (inverted === shouldNormalize(uri))) {
        return source;
      }
      const path = extractname(uri);
      try {
        const formatted:string = await client.sendRequest("abaplint/normalize", {path, source});
        return formatted;
      } catch (error) {
        return source;
      }
    },
  };
};

export const registerBitbucket = async (client: BaseLanguageClient) => {
  const ext = extensions.getExtension<BitBucketApi>("atlassian.atlascode");
  if (!ext) {
    return;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  if (ext.exports?.registerCodeNormalizer) {
    ext.exports.registerCodeNormalizer(norm(client));
  }
};
