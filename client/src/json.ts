/* eslint-disable max-len */
import * as vscode from "vscode";
import {Utils} from "vscode-uri";
import {CodeActionParams} from "vscode-languageclient";

// https://stackoverflow.com/questions/69333492/vscode-create-a-document-in-memory-with-uri-for-automated-testing
// https://code.visualstudio.com/api/extension-guides/virtual-documents
// https://github.com/microsoft/vscode-extension-samples/tree/main/contentprovider-sample

export const JSON_FILE_SYSTEM_PROVIDER_SCHEME = "abaplintJson";

export class jsonFileSystemProvider implements vscode.FileSystemProvider {
  public onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  public static files: {[name: string]: {
    contents: string,
  }} = {};

  public constructor() {
    this.onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>().event;
  }

  public watch(_uri: vscode.Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
    console.dir("watch");
    throw new Error("Method not implemented.");
  }

  public stat(_uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
    console.dir("stat");
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: 10,
    };
  }

  public readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    console.dir("readDirectory");
    throw new Error("Method not implemented.");
  }

  public createDirectory(_uri: vscode.Uri): void | Thenable<void> {
    console.dir("createDirectory");
    throw new Error("Method not implemented.");
  }

  public readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
    console.dir("readFile");
    return Buffer.from(jsonFileSystemProvider.files[Utils.basename(uri)].contents);
  }

  public writeFile(_uri: vscode.Uri, content: Uint8Array, _options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
    console.dir("writeFile");

    const lines = Buffer.from(content).toString().split("\n");
    let output = "";
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (index === 0) {
        output += "`" + line + "` && |\\n| &&\n";
      } else if (index === lines.length - 1) {
        output += "      `" + line + "`.";
      } else {
        output += "      `" + line + "` && |\\n| &&\n";
      }
    }
    console.dir(output);

//    132, 15 to
  }

  public delete(_uri: vscode.Uri, _options: { readonly recursive: boolean; }): void | Thenable<void> {
    console.dir("delete");
    throw new Error("Method not implemented.");
  }

  public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { readonly overwrite: boolean; }): void | Thenable<void> {
    console.dir("rename");
    throw new Error("Method not implemented.");
  }

  public copy?(_source: vscode.Uri, _destination: vscode.Uri, _options: { readonly overwrite: boolean; }): void | Thenable<void> {
    console.dir("copy");
    throw new Error("Method not implemented.");
  }

}

/*
class myProvider implements vscode.TextDocumentContentProvider {
  private readonly onDidChangeEmitter: vscode.EventEmitter<vscode.Uri>;

  public constructor() {
    this.onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  }

  public provideTextDocumentContent(_uri: vscode.Uri): string {
    console.dir("provide");
    return `{"sdf": 2}`;
  }

  public notifyChanged(uri: vscode.Uri) {
    console.dir("notify");
    this.onDidChangeEmitter.fire(uri);
  }

  public get onDidChange() {
    console.dir("did");
//    console.dir(this.onDidChangeEmitter.event);
    return this.onDidChangeEmitter.event;
  }

  public update(uri: vscode.Uri) {
    console.dir("update");
    this.onDidChangeEmitter.fire(uri);
  }
}
*/

export async function editJson(params: CodeActionParams) {
  console.dir("editJson");
  console.dir(params);

  let source: vscode.TextDocument | undefined = undefined;
  for (const t of vscode.workspace.textDocuments) {
    if (t.uri.toString() === params.textDocument.uri) {
      source = t;
    }
  }
  if (source === undefined) {
    return;
  }

  const name = Utils.basename(vscode.Uri.parse(params.textDocument.uri)) + ".json";

  // todo, analyze, source.getText();
  jsonFileSystemProvider.files[name] = {
    contents: `{\n  "hello": 2\n}`,
  };

  const uri = vscode.Uri.parse(JSON_FILE_SYSTEM_PROVIDER_SCHEME + ":/" + name);

  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, {viewColumn: vscode.ViewColumn.Beside, preview: false});

  vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme === JSON_FILE_SYSTEM_PROVIDER_SCHEME) {
      event.document.save();
    }
  });

//  vscode.workspace.openTextDocument({content: `{"sdf": 2}`, language: "json"});

}