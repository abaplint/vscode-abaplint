import * as vscode from "vscode";
import {ExtensionContext} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient/node";

export class Help {
  private helpPanel: vscode.WebviewPanel | undefined;
  private readonly client: BaseLanguageClient;

  public constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  public register(context: ExtensionContext): Help {
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.f1", this.show.bind(this)));
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.show", this.show.bind(this)));
    return this;
  }

  public buildHelp(html: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>abaplint help</title>
    </head>
    <body>` + html + `</body>
    </html>`;
  }

  public helpResponse(html: string) {
    if (this.helpPanel) {
      // Decode percent-encoded URIs in the HTML to fix display on Windows
      // Replace file:///c%3A/ with file:///c:/ (and similar patterns)
      const decodedHtml = html.replace(/file:\/\/\/([a-zA-Z])%3A\//g, "file:///$1:/");
      this.helpPanel.webview.html = this.buildHelp(decodedHtml);
    }
  }

  public show() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }

    if (this.helpPanel === undefined) {
      this.helpPanel = vscode.window.createWebviewPanel(
        "abaplint_help",
        "abaplint help",
        {viewColumn: vscode.ViewColumn.Beside, preserveFocus: true},
        {enableFindWidget: true, enableCommandUris: true, enableScripts: true}
      );
      this.helpPanel.onDidDispose(() => { this.helpPanel = undefined; });
    } else {
      this.helpPanel.reveal(undefined, true);
    }

    this.helpPanel.webview.html = this.buildHelp("loading");

    this.client.sendRequest("abaplint/help/request", {uri: editor.document.uri.toString(), position: editor.selection.active});
  }

}