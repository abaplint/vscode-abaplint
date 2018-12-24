import * as path from "path";
import {workspace, ExtensionContext} from "vscode";
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from "vscode-languageclient";
import * as vscode from "vscode";

let client: LanguageClient;
let myStatusBarItem: vscode.StatusBarItem;

/*
function prettyPrint() {
  console.log("Hello blah!!!");
}
*/

export function activate(context: ExtensionContext) {
  // the server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js"),
  );
  // the debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};

  myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  myStatusBarItem.text = "abaplint";
  myStatusBarItem.show();

//  context.subscriptions.push(vscode.commands.registerCommand("abaplint.prettyPrint", prettyPrint));

  // if the extension is launched in debug mode then the debug server options are used
  // otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {module: serverModule, transport: TransportKind.ipc},
    debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions},
  };

  const clientOptions: LanguageClientOptions = {
// todo, also register XML files?
    documentSelector: [{language: "abap"}],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/abaplint.json"),
    },
  };

  // create the language client and start the client.
  client = new LanguageClient(
    "languageServerABAP",
    "Language Server ABAP",
    serverOptions,
    clientOptions);

  client.onReady().then(() => {
    client.onNotification("abaplint/status", (message: {text: string, tooltip: string}) => {
      myStatusBarItem.text = "abaplint: " + message.text;
      if (message.tooltip) {
        myStatusBarItem.tooltip = message.tooltip;
      } else {
        myStatusBarItem.tooltip = "";
      }
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
