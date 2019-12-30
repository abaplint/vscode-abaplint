import * as vscode from "vscode";
import {ExtensionContext, TextEditorDecorationType} from "vscode";
import {LanguageClient} from "vscode-languageclient";

export class Highlight {
  private readonly client: LanguageClient;
  private readonly decorationType: TextEditorDecorationType;
  private activated: boolean;

  constructor(client: LanguageClient) {
    this.client = client;
    this.decorationType = vscode.window.createTextEditorDecorationType({fontWeight: "bold", border: "1px solid red"});
    this.activated = false;
  }

  public highlightDefinitionsRequest() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }
    this.client.sendRequest("abaplint/highlight/definitions/request", {uri: editor.document.uri.toString()});
  }

  public register(context: ExtensionContext): Highlight {
    const cmd = vscode.commands.registerCommand("abaplint.highlight.definitions", this.highlightDefinitionsRequest.bind(this));
    context.subscriptions.push(cmd);
    return this;
  }

  public highlightDefinitionsResponse(ranges: vscode.Range[]) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    } else if (this.activated === true) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    // todo, check that the user still have the same active editor/uri
    const decorations: vscode.DecorationOptions[] = [];
    for (const r of ranges) {
      decorations.push({range: r});
    }
    editor.setDecorations(this.decorationType, decorations);
    this.activated = true;
  }
}