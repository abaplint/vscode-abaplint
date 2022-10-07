import * as vscode from "vscode";
import {ExtensionContext} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient/node";

export class Flows {
  private panel: vscode.WebviewPanel | undefined;
  private readonly client: BaseLanguageClient;

  public constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  public register(context: ExtensionContext): Flows {
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.dumpstatementflows", this.show.bind(this)));
    return this;
  }

  private build(html: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>abaplint flows</title>
    </head>
    <body>` + html + `</body>
    </html>`;
  }

  public flowResponse(response: string) {
    if (this.panel) {
      let list = JSON.parse(response) as string[];
      list = list.map(l => "<pre>" + l + "</pre>");
      this.panel.webview.html = this.build(list.join("<br><br>\n"));
    }
  }

  public show() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }

    if (this.panel === undefined) {
      this.panel = vscode.window.createWebviewPanel(
        "abaplint_flows",
        "abaplint flows",
        {viewColumn: vscode.ViewColumn.Beside, preserveFocus: true},
        {enableFindWidget: true, enableCommandUris: true, enableScripts: true}
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
    } else {
      this.panel.reveal(undefined, true);
    }

    this.panel.webview.html = this.build("loading");

    this.client.sendRequest("abaplint/dumpstatementflows/request", {uri: editor.document.uri.toString(), position: editor.selection.active});
  }

}