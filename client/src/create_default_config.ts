import {BaseLanguageClient} from "vscode-languageclient";
import * as vscode from "vscode";
import {Buffer} from "buffer";

async function createFile(uri: vscode.Uri, content: string) {
  if (await fileExists(uri)) {
    vscode.window.showErrorMessage("File already exists!");
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  await vscode.window.showTextDocument(uri, {preview: false});
}

async function findFolder(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  // URI is undefined when the command palette is used to create artifacts
  if (!uri) {
    // fallback logic: folder of currently opened window (if it is in the workspace), otherwise root of workspace
    const activeWindowUri = vscode.window.activeTextEditor?.document.uri;
    if (activeWindowUri && vscode.workspace.getWorkspaceFolder(activeWindowUri)) {
      uri = activeWindowUri;
    } else {
      return vscode.workspace.workspaceFolders?.[0]?.uri;
    }
  }

  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type === vscode.FileType.File ? vscode.Uri.joinPath(uri, "..") : uri;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  if (!uri) {
    return false;
  }
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function createConfig(uri: vscode.Uri, config: string) {
  const dir = await findFolder(uri);
  if (!dir) {
    vscode.window.showErrorMessage("Open a workspace folder before creating abaplint.json");
    return;
  }
  const uriConfig = vscode.Uri.joinPath(dir, "abaplint.json");
  await createFile(uriConfig, config);
}

export class CreateDefaultConfig {
  private client: BaseLanguageClient;
  private uri: vscode.Uri;

  public constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  public setClient(client: BaseLanguageClient) {
    this.client = client;
  }

  public register(context: vscode.ExtensionContext): CreateDefaultConfig {
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.create.default-config", this.createDefaultConfig.bind(this)));
    return this;
  }

  public createDefaultConfig(uri: vscode.Uri) {
    this.uri = uri;
    this.client.sendRequest("abaplint/config/default/request");
  }

  public defaultConfigResponse(config: string) {
    createConfig(this.uri, config);
  }
}
