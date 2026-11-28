import * as LServer from "vscode-languageserver";
import {RulesMetadata} from "./rules_metadata";
import * as JSON5 from "json5";
import * as abaplint from "@abaplint/core";

// https://code.visualstudio.com/api/references/icons-in-labels

/** maps ABAP releases to kernel, on-premise and cloud edition releases */
const RELEASE_MAPPING_URL = "https://help.sap.com/docs/abap-cloud/abap-keywords/abap-release-mapping";

export class AbaplintConfigLens {
  public static getCodeLenses(
    textDocument: LServer.TextDocumentIdentifier,
    documents: LServer.TextDocuments<LServer.TextDocument>,
    fallbackActivated: boolean
  ): LServer.CodeLens[] {
    const doc = documents.get(textDocument.uri);
    if (doc === undefined) {
      return [];
    }

    let parsed: any = undefined;
    try {
      parsed = JSON5.parse(doc.getText());
    } catch {
      console.log("AbaplintConfigLens(): Failed to parse JSON5");
      return [];
    }

    const lines = doc.getText().split("\n");
    const lenses: LServer.CodeLens[] = [];

    const experimental = RulesMetadata.getExperimental().filter(
      (k) => parsed.rules && parsed.rules[k.key] !== undefined && parsed.rules[k.key] !== false);

    let disabled = fallbackActivated === true ? RulesMetadata.getNonSingleFile() : [];
    disabled = disabled.filter((k) => parsed.rules && parsed.rules[k.key] !== undefined && parsed.rules[k.key] !== false);

    const versionLine = this.findVersionLine(lines);
    const versionText = this.explainVersion(parsed?.syntax?.version);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i === versionLine && versionText !== undefined) {
        lenses.push({
          range: {
            start: {line: i, character: 0},
            end: {line: i, character: line.length},
          },
          command: {
            title: "$(info) " + versionText,
            tooltip: "Open ABAP release mapping on help.sap.com",
            command: "abaplint.open.url",
            arguments: [RELEASE_MAPPING_URL],
          },
        });
      }

      if (experimental.some((k) => line.includes(`"${k.key}":`))) {
        lenses.push({
          range: {
            start: {line: i, character: 0},
            end: {line: i, character: line.length},
          },
          command: {
            title: "$(error) Experimental",
            command: "",
          },
        });
      }

      if (disabled.some((k) => line.includes(`"${k.key}":`))) {
        lenses.push({
          range: {
            start: {line: i, character: 0},
            end: {line: i, character: line.length},
          },
          command: {
            title: "$(warning) Fallback, rule disabled in editor",
            command: "",
          },
        });
      }
    }

    return lenses;
  }

  /** line of the "version" key inside "syntax" */
  private static findVersionLine(lines: string[]): number | undefined {
    let inSyntax = false;
    for (let i = 0; i < lines.length; i++) {
      if (/"syntax"\s*:/.test(lines[i])) {
        inSyntax = true;
      }
      if (inSyntax && /"version"\s*:/.test(lines[i])) {
        return i;
      }
    }
    return undefined;
  }

  /** explains the release numbers, taken from abaplint core */
  private static explainVersion(version: any): string | undefined {
    let release: abaplint.ABAPRelease | undefined;
    let language: string = abaplint.LanguageVersion.Normal;

    try {
      if (typeof version === "string") {
        release = abaplint.versionToABAPRelease(version as abaplint.Version);
        if (version === abaplint.Version.Cloud) {
          language = abaplint.LanguageVersion.Cloud;
        }
      } else if (typeof version === "object" && typeof version?.release === "string") {
        release = abaplint.Release[version.release];
        language = version.language ?? language;
      }
    } catch {
      return undefined;
    }
    if (release === undefined) {
      return undefined;
    }

    const parts: string[] = [];
    if (release.name === "Newest") {
      parts.push("newest release");
    } else if (release.name === "open-abap") {
      parts.push("open-abap 🚀 the future of ABAP, runs anywhere");
    } else {
      if (release.abap !== null) {parts.push("ABAP " + release.abap);}
      if (release.kernel !== null) {parts.push("kernel " + release.kernel);}
      parts.push("on-prem " + (release.op ?? "-"));
      parts.push("cloud " + (release.cloud ?? "-"));
      parts.push("CE " + (release.ce ?? "-"));
    }
    if (language !== abaplint.LanguageVersion.Normal) {
      parts.push(language + " language");
    }
    return parts.join(" · ");
  }
}
