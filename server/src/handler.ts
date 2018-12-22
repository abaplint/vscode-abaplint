import * as fs from "fs";
import Uri from "vscode-uri";
import * as path from "path";
import * as glob from "glob";
import * as LServer from "vscode-languageserver";
import {WorkspaceFolder} from "vscode-languageserver";
import * as abaplint from "abaplint";
import {Registry} from "abaplint/build/src/registry"; // todo, typing?

interface IFolder {
  root: string;
  dotabapgit: string | undefined;
  starting: string;
}

export class Handler {
  private folders: IFolder[] = [];
  private reg: Registry;
  private connection: LServer.Connection;

  constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.connection = connection;
    this.setFolders(params.workspaceFolders);
    this.readConfig();
    this.loadAllFiles();
  }

  public validateDocument(textDocument: LServer.TextDocument) {
    const diagnostics: LServer.Diagnostic[] = [];

    const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
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

  private loadAllFiles() {
    for (const folder of this.folders) {
      const filenames = glob.sync(folder.starting + "**" + path.sep + "*.*", {nosort: true, nodir: true});
      for (const filename of filenames) {
        const raw = fs.readFileSync(filename, "utf-8");
        this.reg.addFile(new abaplint.MemoryFile(filename, raw.replace(/\r/g, "")));
      }
    }
  }

  private setFolders(workspaces: WorkspaceFolder[] | null) {
    if (workspaces) {
      for (const workspace of workspaces) {
        const pa = Uri.parse(workspace.uri).fsPath;
        this.folders.push({
          root: pa,
          dotabapgit: undefined,
          starting: pa});
      }
    }

    for (const folder of this.folders) {
      const name = folder.root + path.sep + ".abapgit.xml";
      try {
        const xml = fs.readFileSync(name, "utf-8");
        folder.dotabapgit = name;
        const result = xml.match(/<STARTING_FOLDER>([\w\/]+)<\/STARTING_FOLDER>/);

        if (result) {
          folder.starting = folder.root + result[1];
        }
      } catch {
        this.connection.console.log("no .abapgit.xml found, " + name);
      }
    }

    this.connection.console.log("Folder overview:");
    for (const folder of this.folders) {
      this.connection.console.log(folder.root + " " + folder.dotabapgit + " " + folder.starting);
    }
  }

  private readConfig() {
// todo, multi folder vs config?
    try {
      if (this.folders.length > 0) {
        const raw = fs.readFileSync(this.folders[0].root + path.sep + "abaplint.json", "utf-8"); // todo, rootPath is deprecated
        const config = new abaplint.Config(raw);
        this.reg.setConfig(config);
        this.connection.console.log("custom abaplint.json found");
      }
    } catch {
      this.connection.console.log("no custom abaplint config, using defaults");
    }
  }

}