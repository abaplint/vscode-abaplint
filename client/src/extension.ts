import * as path from "path";
import {workspace, ExtensionContext, Uri} from "vscode";
import {LanguageClient as NodeLanguageClient, LanguageClientOptions, ServerOptions, TransportKind, State, CommonLanguageClient} from "vscode-languageclient/node";
import {LanguageClient as BrowserLanguageClient} from "vscode-languageclient/browser";
import * as vscode from "vscode";
import * as fs from "fs";
import {createArtifact} from "./create";
import {Highlight} from "./highlight";
import {Help} from "./help";
import {Config} from "./config";

let client: CommonLanguageClient;
let myStatusBarItem: vscode.StatusBarItem;
let highlight: Highlight;
let help: Help;
let config: Config;

function registerAsFsProvider(client: CommonLanguageClient) {
  /*
  const removeWorkspace = (osPattern: string) => {
    const pattern = path.sep === "/" ? osPattern : Uri.file(osPattern).path;
    for (const f of workspace.workspaceFolders || []) {
      if (pattern.startsWith(f.uri.path)) {
        return pattern.substr(f.uri.path.length).replace(/^\//, "");
      }
    }
    return pattern;
  };
  */

  const toUri = (path: string) => Uri.file(path);
  client.onRequest("readFile", async (path: string) => workspace.fs.readFile(toUri(path)).then(b => Buffer.from(b).toString("utf-8")));
  client.onRequest("unlink", (path: string) => workspace.fs.delete(toUri(path)));
  client.onRequest("exists", async (path: string) => {
    try {
      return !! await workspace.fs.stat(toUri(path));
    } catch (error) {
      return false;
    }
  });
  client.onRequest("isDirectory", (path: string) => workspace.fs.stat(toUri(path)).then(s => s.type === vscode.FileType.Directory));
  client.onRequest("rmdir", (path: string) => workspace.fs.delete(toUri(path)));
  client.onRequest("readdir", (path: string) => workspace.fs.readDirectory(toUri(path)).then(l => l.map(e => e[0])));
  client.onRequest("glob", async (pattern: string) => {
    let p = pattern;
    if (p.startsWith("/")) {
      p = p.substr(1);
    }
    const files = await vscode.workspace.findFiles(p);
    console.log(files.length + " files found in " + p);
    return files.map(f => f.path);
  });
}

export function activate(context: ExtensionContext) {
  myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  myStatusBarItem.text = "abaplint";
  myStatusBarItem.show();

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{language: "abap"}, {language: "xml"}],
    progressOnInitialization: true,
    initializationOptions:{
      provideFsProxy: true,
    },
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/abaplint.json*"),
    },
  };

  context.subscriptions.push(vscode.commands.registerCommand("abaplint.create.artifact", createArtifact));

  if (fs.read === undefined) {
    myStatusBarItem.text = "abaplint: web";
    const serverMain = Uri.joinPath(context.extensionUri, "out-browser/server.js");
    const worker = new Worker(serverMain.toString());
    client = new BrowserLanguageClient("languageServerABAP", "Language Server ABAP", clientOptions, worker);
  } else {
    myStatusBarItem.text = "abaplint: native";
    const serverModule = context.asAbsolutePath(path.join("out-native", "server.js"));
    const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};
    const serverOptions: ServerOptions = {
      run: {module: serverModule, transport: TransportKind.ipc},
      debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions},
    };
    client = new NodeLanguageClient("languageServerABAP", "Language Server ABAP", serverOptions, clientOptions);
  }

  client.registerProposedFeatures();

  highlight = new Highlight(client).register(context);
  help = new Help(client).register(context);
  config = new Config(client).register(context);
  client.onDidChangeState(change => {
    if (change.newState === State.Running) {
      registerAsFsProvider(client);
    }
  });

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
    client.onNotification("abaplint/config/default/response", (data) => {
      config.defaultConfigResponse(data);
    });
    client.onNotification("abaplint/highlight/definitions/response", (data) => {
      highlight.highlightDefinitionsResponse(data.ranges, data.uri);
    });
    client.onNotification("abaplint/highlight/reads/response", (data) => {
      highlight.highlightReadsResponse(data.ranges, data.uri);
    });
    client.onNotification("abaplint/highlight/writes/response", (data) => {
      highlight.highlightWritesResponse(data.ranges, data.uri);
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
