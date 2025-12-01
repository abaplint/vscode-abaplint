import {extensions, Uri, workspace} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient";

export const ATLASCODEDIFF = "atlascode.bbpr";
export interface CodeNormalizer {
    isRelevant: (u: Uri) => boolean;
    normalize: (code: string, uri: Uri) => Promise<string>;
}

export let integrationIsActive:(u:Uri) => boolean = () => false;
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
export const getAbapCodeNormalizer = (client: BaseLanguageClient):CodeNormalizer => {
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

// registers a code formatter for bitbucket using an API which will probably never be merged
// for now it's available on my fork of atlascode:
// https://bitbucket.org/marcellourbani/atlascode/branch/issue-%235433-Add-hook-to-pretty-print-code-to-show-in-diff-in-atlascode
// allows to:
//  - normalize the code by default
//  - get bitbucket functionality (i.e. comments) to work after normalizing
export const registerBitbucket = async (client: BaseLanguageClient) => {
  const ext = extensions.getExtension<BitBucketApi>("atlassian.atlascode");
  if (!ext) {
    return;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  if (ext.exports?.registerCodeNormalizer) {
    const norm = getAbapCodeNormalizer(client);
    integrationIsActive = (u) => u.scheme === ATLASCODEDIFF && norm.isRelevant(u);
    ext.exports.registerCodeNormalizer(norm);
  }
};
