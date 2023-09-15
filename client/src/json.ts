/* eslint-disable max-len */
import * as vscode from "vscode";
import {Utils} from "vscode-uri";
import {CodeActionParams} from "vscode-languageclient";

// https://stackoverflow.com/questions/69333492/vscode-create-a-document-in-memory-with-uri-for-automated-testing
// https://code.visualstudio.com/api/extension-guides/virtual-documents
// https://github.com/microsoft/vscode-extension-samples/tree/main/contentprovider-sample

function findDocument(uri: string): vscode.TextDocument | undefined {
  let source: vscode.TextDocument | undefined = undefined;
  for (const t of vscode.workspace.textDocuments) {
    if (t.uri.toString() === uri) {
      source = t;
    }
  }
  return source;
}

export const JSON_FILE_SYSTEM_PROVIDER_SCHEME = "abaplintJson";

export class jsonFileSystemProvider implements vscode.FileSystemProvider {
  public onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  public static files: {[name: string]: {
    target: string,
    contents: string,
    startRow: number,
  }} = {};

  public constructor() {
    this.onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>().event;
  }

  public watch(_uri: vscode.Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
    console.dir("jsonFileSystemProvider, watch");
    throw new Error("Method not implemented.");
  }

  public stat(_uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: 10,
    };
  }

  public readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    console.dir("jsonFileSystemProvider, readDirectory");
    throw new Error("Method not implemented.");
  }

  public createDirectory(_uri: vscode.Uri): void | Thenable<void> {
    console.dir("jsonFileSystemProvider, createDirectory");
    throw new Error("Method not implemented.");
  }

  public readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
    return Buffer.from(jsonFileSystemProvider.files[Utils.basename(uri)].contents);
  }

  public static update(uri: vscode.Uri, updatedJson: string) {
    const file = jsonFileSystemProvider.files[Utils.basename(uri)];

    const found = findDocument(file.target);
    if (found === undefined) {
      console.dir("document not found");
      return;
    }

    let end: vscode.Position | undefined = undefined;
    let indentation = 0;
    let startCol = 0;
    {
      const lines = found.getText().split("\n");
      indentation = lines[file.startRow].search(/\S/) + 2;
      startCol = lines[file.startRow].search(/`{/);
      for (let index = file.startRow; index < lines.length; index++) {
        const line = lines[index];
        const trimmed = line.trimEnd();
        if (trimmed.endsWith(".")) {
          end = new vscode.Position(index, trimmed.length);
          break;
        }
      }
    }
    if (end === undefined) {
      console.dir("end not found");
      return;
    }

    let output = "";
    {
      const lines = updatedJson.split("\n");
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (index === 0) {
          output += "`" + line + "` && |\\n| &&\n";
        } else if (index === lines.length - 1) {
          output += " ".repeat(indentation) + "`" + line + "`.";
        } else {
          output += " ".repeat(indentation) + "`" + line + "` && |\\n| &&\n";
        }
      }
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(found?.uri, new vscode.Range(new vscode.Position(file.startRow, startCol), end), output);
    vscode.workspace.applyEdit(edit);
  }

  public writeFile(uri: vscode.Uri, content: Uint8Array, _options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
    jsonFileSystemProvider.update(uri, Buffer.from(content).toString());
  }

  public delete(_uri: vscode.Uri, _options: { readonly recursive: boolean; }): void | Thenable<void> {
    console.dir("delete");
    throw new Error("jsonFileSystemProvider, Method delete not implemented.");
  }

  public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { readonly overwrite: boolean; }): void | Thenable<void> {
    console.dir("rename");
    throw new Error("jsonFileSystemProvider, Method rename not implemented.");
  }

  public copy?(_source: vscode.Uri, _destination: vscode.Uri, _options: { readonly overwrite: boolean; }): void | Thenable<void> {
    console.dir("copy");
    throw new Error("jsonFileSystemProvider, Method copy not implemented.");
  }

}

export async function editJson(params: CodeActionParams) {
  const source = findDocument(params.textDocument.uri);
  if (source === undefined) {
    return;
  }

  const name = Utils.basename(vscode.Uri.parse(params.textDocument.uri)) + ".json";

  jsonFileSystemProvider.files[name] = {
    target: params.textDocument.uri,
    contents: `{\n  "hello": 2\n}`,   // todo, analyze, source.getText();
    startRow: params.range.start.line,
  };

  const uri = vscode.Uri.parse(JSON_FILE_SYSTEM_PROVIDER_SCHEME + ":/" + name);

  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, {viewColumn: vscode.ViewColumn.Beside, preview: false});

  vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme === JSON_FILE_SYSTEM_PROVIDER_SCHEME) {
      jsonFileSystemProvider.update(event.document.uri, event.document.getText());
    }
  });

}