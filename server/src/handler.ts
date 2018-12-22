// import {Registry} from "abaplint";
import * as fs from "fs";
import * as path from "path";
import * as LServer from "vscode-languageserver";
import {WorkspaceFolder} from "vscode-languageserver";
import * as abaplint from "abaplint";

export class Handler {
  private folders: WorkspaceFolder[] | null;
  private reg: any; // todo, typing?
  private connection: LServer.Connection;

  constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.folders = params.workspaceFolders;
    this.connection = connection;
    this.setConfig();
  }

  public getConfig() {
    return this.reg.getConfig();
  }

  private setConfig() {
    if (this.folders) {
      for (const folder of this.folders) {
        this.connection.console.log(folder.name + " " + folder.uri);
      }
    }

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