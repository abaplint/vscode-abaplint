import {URI} from "vscode-uri";
import {IFolder} from "./handler";
import {FileOperations} from "./file_operations";
import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";
import * as path from "path";

export class Setup {
  private readonly connection: LServer.Connection;

  public constructor(connection: LServer.Connection) {
    this.connection = connection;
  }

  public determineFolders(workspaces: LServer.WorkspaceFolder[] | null): IFolder[] {
    const ret: IFolder[] = [];

    if (workspaces) {
      for (const workspace of workspaces) {
        ret.push({
          root: URI.parse(workspace.uri).fsPath,
          glob: "/src/**/*.*"});  // todo, this should be taken from abaplint.json
      }
    }

    this.connection.console.log("Folder overview:");
    for (const folder of ret) {
      this.connection.console.log(folder.root + " " + folder.glob);
    }
    return ret;
  }

  public async readConfig(folders: IFolder[]) {

    try {
      if (folders.length > 0) {
        const name = folders[0].root + path.sep + "abaplint.json";
        const raw = await FileOperations.readFile(name);
        this.connection.console.log("custom abaplint.json found");
        const config = new abaplint.Config(raw);
        folders[0].glob = config.get().global.files;
        return config;
      }
    // eslint-disable-next-line no-empty
    } catch {}

    this.connection.console.log("no custom abaplint config, using defaults");
    return abaplint.Config.getDefault();
  }

}