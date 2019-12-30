import * as path from "path";
import {workspace, ExtensionContext} from "vscode";
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from "vscode-languageclient";
import * as vscode from "vscode";
import {createArtifact} from "./create";
import {Highlight} from "./highlight";

let client: LanguageClient;
let myStatusBarItem: vscode.StatusBarItem;
let highlight: Highlight;
let helpPanel: vscode.WebviewPanel | undefined;

function dummy() {
// dont do anything
}

function show() {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return;
  }

  if (helpPanel === undefined) {
    helpPanel = vscode.window.createWebviewPanel(
      "abaplint_help",
      "abaplint",
      {viewColumn: vscode.ViewColumn.Beside, preserveFocus: true},
    );
    helpPanel.onDidDispose(() => { helpPanel = undefined; });
  } else {
    helpPanel.reveal(undefined, true);
  }

  helpPanel.webview.html = buildHelp("loading");

  client.sendRequest("abaplint/help/request", {uri: editor.document.uri.toString(), position: editor.selection.active});
}

function buildHelp(html: string): string {
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

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
  const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};

  myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  myStatusBarItem.text = "abaplint";
  myStatusBarItem.show();

  context.subscriptions.push(vscode.commands.registerCommand("abaplint.dummy", dummy));
  context.subscriptions.push(vscode.commands.registerCommand("abaplint.f1", show));
  context.subscriptions.push(vscode.commands.registerCommand("abaplint.show", show));
  context.subscriptions.push(vscode.commands.registerCommand("abaplint.create.artifact", createArtifact));

  const serverOptions: ServerOptions = {
    run: {module: serverModule, transport: TransportKind.ipc},
    debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions},
  };

  const clientOptions: LanguageClientOptions = {
// todo, also register XML files? yes, but look for abaplint.json / .abapgit.xml
    documentSelector: [{language: "abap"}],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/abaplint.json"),
    },
  };

  client = new LanguageClient("languageServerABAP", "Language Server ABAP", serverOptions, clientOptions);

  highlight = new Highlight(client).register(context);

  client.onReady().then(() => {
    client.onNotification("abaplint/status", (message: {text: string, tooltip: string}) => {
      myStatusBarItem.text = "abaplint: " + message.text;
      if (message.tooltip) {
        myStatusBarItem.tooltip = message.tooltip;
      } else {
        myStatusBarItem.tooltip = "";
      }
    });

    client.onNotification("abaplint/help/response", (html: string) => {
      if (helpPanel) {
        helpPanel.webview.html = buildHelp(html);
      }
    });

    client.onNotification("abaplint/highlight/definitions/response", (data) => {
      highlight.highlightDefinitionsResponse(data.ranges);
    });
  });
  context.subscriptions.push(client.start());
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
