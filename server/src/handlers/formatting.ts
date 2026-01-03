import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";

export class Formatting {
  private readonly reg: abaplint.IRegistry;

  public constructor(reg: abaplint.IRegistry) {
    this.reg = reg;
  }

  public async findEdits(document: LServer.TextDocumentIdentifier, formattingDisabled: string[]): Promise<LServer.TextEdit[]> {
    const edits: LServer.TextEdit[] = [];
    // @ts-expect-error Diagnostics doesn't exist anymore?
    const issues = new abaplint.Diagnostics(this.reg).findIssues(document);
    for (const i of issues) {
      if (formattingDisabled.includes(i.getKey())) {
        continue;
      }

      const edit = i.getDefaultFix();
      if (edit === undefined) {
        continue;
      }
      //@ts-expect-error LSPEdit does not exist in abaplint?
      const changes = abaplint.LSPEdit.mapEdit(edit).changes?.[document.uri] || [];
      edits.push(...changes);
    }

    return edits;
  }

}