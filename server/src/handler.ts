// import {Registry} from "abaplint";
import * as fs from "fs";
import * as path from "path";
import * as LServer from "vscode-languageserver";
import {WorkspaceFolder} from "vscode-languageserver";
import * as abaplint from "abaplint";
import {Registry} from "abaplint/build/src/registry"; // todo, typing?

export class Handler {
  private folders: WorkspaceFolder[] | null;
  private reg: Registry;
  private connection: LServer.Connection;

  constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.folders = params.workspaceFolders;
    this.connection = connection;
    this.setConfig();
// todo, load all files from folders
// todo, also XML files should be loaded into registry
  }

  public getConfig() {
    return this.reg.getConfig();
  }

  public validateDocument(textDocument: LServer.TextDocument) {
    const diagnostics: LServer.Diagnostic[] = [];

    const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
    /*
    const issues = new abaplint.Registry(this.getConfig()).addFile(file).findIssues();
    */

    try {
      this.reg.updateFile(file);
    } catch  {
      this.reg.addFile(file);
    }

    for (const issue of this.reg.findIssues()) {
      if (issue.getFile().getFilename() === textDocument.uri) {
        const diagnosic: LServer.Diagnostic = {
          severity: LServer.DiagnosticSeverity.Error,
          range: {
            start: {line: issue.getStart().getRow() - 1, character: issue.getStart().getCol() - 1},
            end: {line: issue.getEnd().getRow() - 1, character: issue.getEnd().getCol() - 1},
          },
          code: issue.getCode(),
          message: issue.getMessage().toString(),
          source: "abaplint",
        };
        diagnostics.push(diagnosic);
      }
    }

    this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
  }

  private setConfig() {
    if (this.folders) {
      for (const folder of this.folders) {
        this.connection.console.log(folder.name + " " + folder.uri);
      }
    }
// todo, multi folder vs config?
    try {
      if (this.folders) {
        const raw = fs.readFileSync(this.folders[0].uri + path.sep + "abaplint.json", "utf-8"); // todo, rootPath is deprecated
        const config = new abaplint.Config(raw);
        this.reg.setConfig(config);
        this.connection.console.log("custom abaplint.json found");
      }
    } catch (err) {
      this.connection.console.log("no custom abaplint config, using defaults");
    }
  }

}