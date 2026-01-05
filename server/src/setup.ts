import {URI, Utils} from "vscode-uri";
import {IFolder} from "./types";
import {FileOperations} from "./file_operations";
import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";
import {ExtraSettings} from "./extra_settings";

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
          glob: ["/src/**/*.*"]});  // todo, this should be taken from abaplint.json
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

  public async readConfig(folders: IFolder[], settings: ExtraSettings): Promise<{config: abaplint.Config, configPath?: string}> {
    const found = await this.findCustomConfig(folders, settings.activeTextEditorUri);
    if (found) {
      this.connection.console.log("custom abaplint configuration found");
      const config = new abaplint.Config(found.config);
      const cfiles = config.get().global.files;
      folders[0].glob = Array.isArray(cfiles)
        ? cfiles.map(f => found.prefix + f)
        : [found.prefix + cfiles];
      return {config, configPath: found.path};
    }

    this.connection.console.log("no custom abaplint config, using defaults");
    return {config: abaplint.Config.getDefault()};
  }

  private async searchFolderForConfig(scheme: string, authority: string, prefix: string):
      Promise<{config: string, path: string} | undefined> {
    let uri = URI.from({scheme: scheme, authority: authority, path: prefix + "abaplint.json"});
    try {
      this.connection.console.log("search: " + uri.toString());
      const config = await FileOperations.readFile(uri.toString());
      return {config, path: uri.toString()};
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: scheme, authority: authority, path: prefix + "abaplint.jsonc"});
    try {
      this.connection.console.log("search: " + uri.toString());
      const config = await FileOperations.readFile(uri.toString());
      return {config, path: uri.toString()};
    // eslint-disable-next-line no-empty
    } catch {}

    uri = URI.from({scheme: scheme, authority: authority, path: prefix + "abaplint.json5"});
    try {
      this.connection.console.log("search: " + uri.toString());
      const config = await FileOperations.readFile(uri.toString());
      return {config, path: uri.toString()};
    // eslint-disable-next-line no-empty
    } catch {}

    return undefined;
  }

  private async findCustomConfig(folders: IFolder[], activeTextEditorUri: string | undefined):
      Promise<{config: string, prefix: string, path: string} | undefined> {
    if (folders.length === 0 || folders[0] === undefined) {
      return undefined;
    }
    const addSlash = (p:string) => p.endsWith("/") ? p : p + "/";

    const prefix = addSlash(folders[0].root);
    this.connection.console.log("prefix: " + prefix);
    this.connection.console.log("activeTextEditorUri: " + activeTextEditorUri);
    this.connection.console.log("scheme: " + folders[0].scheme);
//    this.connection.console.log(URI.from({scheme: folders[0].scheme, path: prefix + "abaplint.json"}).toString());

    if (activeTextEditorUri !== undefined) {
      const start = URI.parse(activeTextEditorUri);
      let current = addSlash(Utils.dirname(start).path);
      while (current !== prefix) {
        const found = await this.searchFolderForConfig(folders[0].scheme, folders[0].authority, current);
        if (found) {
          return {
            config: found.config,
            prefix: current.substring(prefix.length - 1, current.length - 1),
            path: found.path,
          };
        }

        current = addSlash(Utils.joinPath(URI.parse(current), "..").path);
      }
    }

    // root folder
    const found = await this.searchFolderForConfig(folders[0].scheme, folders[0].authority, prefix);
    if (found) {
      return {
        config: found.config,
        prefix: "",
        path: found.path,
      };
    }

    return undefined;
  }

}
