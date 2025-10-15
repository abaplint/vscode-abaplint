import {CreateDefaultConfig} from "./create_default_config";
import {Help} from "./help";
import {Highlight} from "./highlight";
import {LanguageClient as BrowserLanguageClient} from "vscode-languageclient/browser";
import {LanguageClient as NodeLanguageClient, LanguageClientOptions, ServerOptions, TransportKind, State, BaseLanguageClient} from "vscode-languageclient/node";
import {registerBitbucket} from "./integrations";
import {registerNormalizer} from "./normalize";
import {TestController} from "./test_controller";
import {workspace, ExtensionContext, Uri} from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

let abaplintStatusBarItem: vscode.StatusBarItem;
let client: BaseLanguageClient;
let createDefaultConfig: CreateDefaultConfig;
let help: Help;
let highlight: Highlight;
let disposeAll:()=>void|undefined;

function registerAsFsProvider(client: BaseLanguageClient) {
  const toUri = (path: string) => Uri.file(path);
  client.onRequest("readFile", async (uri: string) => workspace.fs.readFile(Uri.parse(uri)).then(b => Buffer.from(b).toString("utf-8")));
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
    return files.map(f => f.toString());
  });
}

export function activate(context: ExtensionContext) {
  disposeAll = () => context.subscriptions.forEach(async d => d.dispose());
  abaplintStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  abaplintStatusBarItem.text = "abaplint";
  abaplintStatusBarItem.show();

  const clientOptions: LanguageClientOptions = {
    // AFF is JSON, abaplint.jsonc can be JSONC, used for code lens
    documentSelector: [{language: "abap"}, {language: "xml"}, {language: "json"}, {language: "jsonc"}],
    progressOnInitialization: true,
    initializationOptions: {
      provideFsProxy: true,
      enableSemanticHighlighting: workspace.getConfiguration("abaplint").get("enableSemanticHighlighting", true),
// when running in web mode, it fails posting these values as messages, so convert to raw JSON,
      codeLens: JSON.parse(JSON.stringify(workspace.getConfiguration("abaplint").get("codeLens"))),
      inlayHints: JSON.parse(JSON.stringify(workspace.getConfiguration("abaplint").get("inlayHints"))),
      activeTextEditorUri: vscode.window.activeTextEditor?.document.uri.toString(),
    },
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/abaplint.json*"),
    },
  };

  const fallbackSettings = JSON.parse(JSON.stringify(workspace.getConfiguration("abaplint").get("fallback")));

  if (fs.read === undefined) {
    abaplintStatusBarItem.text = "abaplint: web";
    const serverMain = Uri.joinPath(context.extensionUri, "out-browser/server.js");
    const worker = new Worker(serverMain.toString());
    clientOptions.initializationOptions.fallbackThreshold = fallbackSettings.web;
    client = new BrowserLanguageClient("languageServerABAP", "Language Server ABAP", clientOptions, worker);
  } else {
    abaplintStatusBarItem.text = "abaplint: native";
    const serverModule = context.asAbsolutePath(path.join("out-native", "server.js"));
    const debugOptions = {execArgv: ["--nolazy", "--inspect=6009"]};
    const serverOptions: ServerOptions = {
      run: {module: serverModule, transport: TransportKind.ipc},
      debug: {module: serverModule, transport: TransportKind.ipc, options: debugOptions},
    };
    clientOptions.initializationOptions.fallbackThreshold = fallbackSettings.native;
    client = new NodeLanguageClient("languageServerABAP", "Language Server ABAP", serverOptions, clientOptions);
  }

  client.registerProposedFeatures();

  highlight = new Highlight(client).register(context);
  help = new Help(client).register(context);
  createDefaultConfig = new CreateDefaultConfig(client).register(context);
  client.onDidChangeState(change => {
    if (change.newState === State.Running) {
      registerAsFsProvider(client);
    }
  });

  new TestController(client);

  client.start().then(() => {
    client.onNotification("abaplint/status", (message: {text: string, tooltip: string}) => {
      abaplintStatusBarItem.text = "abaplint: " + message.text;
      if (message.tooltip) {
        abaplintStatusBarItem.tooltip = message.tooltip;
      } else {
        abaplintStatusBarItem.tooltip = "";
      }
    });
    client.onNotification("abaplint/help/response", (data) => {
      help.helpResponse(data);
    });
    client.onNotification("abaplint/config/default/response", (data) => {
      createDefaultConfig.defaultConfigResponse(data);
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
  registerNormalizer(context, client);
  registerBitbucket(client);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  const stop =  client.stop().then(() => client.dispose());
  if (disposeAll) {disposeAll();}
  return stop;
}

