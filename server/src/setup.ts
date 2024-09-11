import {URI} from "vscode-uri";
import {IFolder} from "./handler";
import {FileOperations} from "./file_operations";
import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";

export class Setup {
  private readonly connection: LServer.Connection;

  public constructor(connection: LServer.Connection) {
    this.connection = connection;
  }

  public determineFolders(workspaces: LServer.WorkspaceFolder[] | null): IFolder[] {
    const ret: IFolder[] = [];

    if (workspaces) {
      for (const workspace of workspaces) {
        this.connection.console.log("Workspace uri: " + workspace.uri.toString());
        const parsed = URI.parse(workspace.uri);
        ret.push({
          root: parsed.path,
          scheme: parsed.scheme,
          authority: parsed.authority,
          glob: "/src/**/*.*"});  // todo, this should be taken from abaplint.json
      }
    }

    this.dumpFolders(ret);
    return ret;
  }

  public dumpFolders(folders: IFolder[]) {
    this.connection.console.log("Folder overview:");
    for (const folder of folders) {
      this.connection.console.log(folder.root + " " + folder.glob);
    }
  }

  public async readConfig(folders: IFolder[]) {
    const raw = await this.findCustomConfig(folders);
    if (raw && raw !== "") {
      this.connection.console.log("custom abaplint configuration found");
      const config = new abaplint.Config(raw);
      folders[0].glob = config.get().global.files;
      return config;
    }

    this.connection.console.log("no custom abaplint config, using defaults");
    return abaplint.Config.getDefault();
  }

  private async searchFolderForConfig() {
    let uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.json"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.jsonc"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.json5"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}
  }

  private async findCustomConfig(folders: IFolder[]): Promise<string | undefined> {
    if (folders.length === 0 || folders[0] === undefined) {
      return undefined;
    }

    const prefix = folders[0].root + "/";
    this.connection.console.log("prefix: " + prefix);
    this.connection.console.log("scheme: " + folders[0].scheme);
//    this.connection.console.log(URI.from({scheme: folders[0].scheme, path: prefix + "abaplint.json"}).toString());

    let uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.json"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.jsonc"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: folders[0].scheme, authority: folders[0].authority, path: prefix + "abaplint.json5"});
    try {
      this.connection.console.log("search: " + uri.toString());
      return await FileOperations.readFile(uri.toString());
    // eslint-disable-next-line no-empty
    } catch {}

    return undefined;
  }

}