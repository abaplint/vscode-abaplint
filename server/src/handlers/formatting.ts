import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";

export class Formatting {
  private readonly reg: abaplint.IRegistry;

  public constructor(reg: abaplint.IRegistry) {
    this.reg = reg;
  }

  public async findEdits(_document: LServer.TextDocumentIdentifier): Promise<LServer.TextEdit[]> {
    const edits: LServer.TextEdit[] = [];
    /*
    const diagnostics = new abaplint.LanguageServer(this.reg);


    for (const diagnostic of diagnostics) {

    }
    */

    return edits;
  }

}