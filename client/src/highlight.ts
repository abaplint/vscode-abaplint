import * as vscode from "vscode";
import {ExtensionContext, TextEditorDecorationType} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient/node";

// todo, refactor, a lot of the code in this class is similar, lazy me

export class Highlight {
  private readonly client: BaseLanguageClient;
  private readonly definitionsType: TextEditorDecorationType;
  private readonly readsType: TextEditorDecorationType;
  private readonly writesType: TextEditorDecorationType;
  private readonly definitionsActivated: string[];
  private readonly readsActivated: string[];
  private readonly writesActivated: string[];

  public constructor(client: BaseLanguageClient) {
    this.client = client;
    this.definitionsType = vscode.window.createTextEditorDecorationType({backgroundColor: "darkgreen"});
    this.readsType = vscode.window.createTextEditorDecorationType({border: "1px solid red"});
    this.writesType = vscode.window.createTextEditorDecorationType({outline: "1px solid blue"});
    this.definitionsActivated = [];
    this.readsActivated = [];
    this.writesActivated = [];
  }

  public highlightDefinitionsRequest() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }
    this.client.sendRequest("abaplint/highlight/definitions/request", {uri: editor.document.uri.toString()});
  }

  public highlightReadsRequest() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }
    this.client.sendRequest("abaplint/highlight/reads/request", {uri: editor.document.uri.toString()});
  }

  public highlightWritesRequest() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }
    this.client.sendRequest("abaplint/highlight/writes/request", {uri: editor.document.uri.toString()});
  }

  public register(context: ExtensionContext): Highlight {
    const cmd1 = vscode.commands.registerCommand("abaplint.highlight.definitions", this.highlightDefinitionsRequest.bind(this));
    context.subscriptions.push(cmd1);

    const cmd2 = vscode.commands.registerCommand("abaplint.highlight.reads", this.highlightReadsRequest.bind(this));
    context.subscriptions.push(cmd2);

    const cmd3 = vscode.commands.registerCommand("abaplint.highlight.writes", this.highlightWritesRequest.bind(this));
    context.subscriptions.push(cmd3);

    return this;
  }

  public highlightDefinitionsResponse(ranges: vscode.Range[], resultUri: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }

    const uri = editor.document.uri.toString();
    if (resultUri !== uri) {
      return;
    }

    if (this.definitionsActivated.indexOf(uri) >= 0) {
      this.definitionsActivated.splice(this.definitionsActivated.indexOf(uri), 1);
      editor.setDecorations(this.definitionsType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const r of ranges) {
      decorations.push({range: r});
    }
    editor.setDecorations(this.definitionsType, decorations);
    this.definitionsActivated.push(uri);
  }

  public highlightReadsResponse(ranges: vscode.Range[], resultUri: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }

    const uri = editor.document.uri.toString();
    if (resultUri !== uri) {
      return;
    }

    if (this.readsActivated.indexOf(uri) >= 0) {
      this.readsActivated.splice(this.readsActivated.indexOf(uri), 1);
      editor.setDecorations(this.readsType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const r of ranges) {
      decorations.push({range: r});
    }
    editor.setDecorations(this.readsType, decorations);
    this.readsActivated.push(uri);
  }

  public highlightWritesResponse(ranges: vscode.Range[], resultUri: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }

    const uri = editor.document.uri.toString();
    if (resultUri !== uri) {
      return;
    }

    if (this.writesActivated.indexOf(uri) >= 0) {
      this.writesActivated.splice(this.writesActivated.indexOf(uri), 1);
      editor.setDecorations(this.writesType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    for (const r of ranges) {
      decorations.push({range: r});
    }
    editor.setDecorations(this.writesType, decorations);
    this.writesActivated.push(uri);
  }
}