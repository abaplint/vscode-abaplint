import * as LServer from "vscode-languageserver";
import {RulesMetadata} from "./rules_metadata";

// https://code.visualstudio.com/api/references/icons-in-labels

export class AbaplintConfigLens {
  public static getCodeLenses(
    textDocument: LServer.TextDocumentIdentifier,
    documents: LServer.TextDocuments<LServer.TextDocument>,
    _fallbackActivated: boolean
  ): LServer.CodeLens[] {
    const doc = documents.get(textDocument.uri);
    if (doc === undefined) {
      return [];
    }

    let parsed: any = undefined;
    try {
      parsed = JSON.parse(doc.getText());
    } catch {
      return [];
    }

    const lines = doc.getText().split("\n");
    const lenses: LServer.CodeLens[] = [];

    const experimental = RulesMetadata.getExperimental().filter(
      (k) => parsed.rules && parsed.rules[k.key] !== undefined && parsed.rules[k.key] !== false);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (experimental.some((k) => line.includes(`"${k.key}":`))) {
        lenses.push({
          range: {
            start: {line: i, character: 0},
            end: {line: i, character: line.length},
          },
          command: {
            title: "$(notebook-state-error) Experimental",
            command: "",
          },
        });
      }
    }

    return lenses;
  }
}
