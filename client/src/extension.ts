import * as path from "path";
import {workspace, ExtensionContext} from "vscode";
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from "vscode-languageclient";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // the server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js"),
  );
  // the debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};

  // if the extension is launched in debug mode then the debug server options are used
  // otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {module: serverModule, transport: TransportKind.ipc},
    debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions},
  };

  // options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{scheme: "file", language: "abap"}],
    synchronize: {
    // notify the server about file changes to abaplint.json files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/abaplint.json"),
    },
  };

  // create the language client and start the client.
  client = new LanguageClient(
    "languageServerABAP",
    "Language Server ABAP",
    serverOptions,
    clientOptions);

  // start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
