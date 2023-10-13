import * as path from "path";
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

async function findFolder(uri: vscode.Uri) {
  // URI is undefined when the command palette is used to create artifacts
  if (!uri) {
    // fallback logic: folder of currently opened window (if it is in the workspace), otherwise root of workspace
    const activeWindowUri = vscode.window.activeTextEditor?.document.uri;
    if (activeWindowUri && vscode.workspace.getWorkspaceFolder(activeWindowUri)) {
      uri = activeWindowUri;
    } else {
      return vscode.workspace.rootPath + path.sep;
    }
  }

  const parsed = path.parse(uri.fsPath);
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type === vscode.FileType.File ?
    parsed.dir + path.sep :
    parsed.dir + path.sep + parsed.base + path.sep;
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

export async function createConfig(uri: vscode.Uri, config: string) {
  const dir = await findFolder(uri);
  const filename = dir + "abaplint.json";
  const uriConfig = vscode.Uri.file(filename);
  await createFile(uriConfig, config);
}
