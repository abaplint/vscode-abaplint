import * as path from "path";
import {workspace, ExtensionContext} from "vscode";
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from "vscode-languageclient";
import * as vscode from "vscode";
import {createArtifact} from "./create";
import {Highlight} from "./highlight";
import {Help} from "./help";

let client: LanguageClient;
let myStatusBarItem: vscode.StatusBarItem;
let highlight: Highlight;
let help: Help;

function dummy() {
// used for catching shortcuts CTRL+F1 and CTRL+F2
// dont do anything
}

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
  const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};

  myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  myStatusBarItem.text = "abaplint";
  myStatusBarItem.show();

  context.subscriptions.push(vscode.commands.registerCommand("abaplint.dummy", dummy));
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
  help = new Help(client).register(context);

  client.onReady().then(() => {
    client.onNotification("abaplint/status", (message: {text: string, tooltip: string}) => {
      myStatusBarItem.text = "abaplint: " + message.text;
      if (message.tooltip) {
        myStatusBarItem.tooltip = message.tooltip;
      } else {
        myStatusBarItem.tooltip = "";
      }
    });

    client.onNotification("abaplint/help/response", (data) => {
      help.helpResponse(data);
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
