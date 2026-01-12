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
let localConfigWatcher: vscode.FileSystemWatcher | undefined;

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

function setupLocalConfigWatcher(context: ExtensionContext, localConfigPath: string) {
  // Dispose of existing watcher if any
  if (localConfigWatcher) {
    localConfigWatcher.dispose();
    localConfigWatcher = undefined;
  }

  // Only set up watcher if localConfigPath is configured
  if (!localConfigPath || localConfigPath.length === 0) {
    return;
  }

  try {
    // Create file system watcher for the specific local config file
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(localConfigPath)),
      path.basename(localConfigPath)
    );

    localConfigWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    context.subscriptions.push(localConfigWatcher);

    // Watch for changes to the config file
    localConfigWatcher.onDidChange(async () => {
      console.log(`Local config file changed: ${localConfigPath}`);
      // Send request to server to reload config with the current localConfigPath
      const currentLocalConfigPath = workspace.getConfiguration("abaplint").get("localConfigPath", "");
      await client.sendRequest("abaplint/config/reload/request", {localConfigPath: currentLocalConfigPath});
      // Refresh help page if it's open
      help.refresh();
    });

    // Watch for creation of the config file
    localConfigWatcher.onDidCreate(async () => {
      console.log(`Local config file created: ${localConfigPath}`);
      const currentLocalConfigPath = workspace.getConfiguration("abaplint").get("localConfigPath", "");
      await client.sendRequest("abaplint/config/reload/request", {localConfigPath: currentLocalConfigPath});
      help.refresh();
    });

    // Watch for deletion of the config file
    localConfigWatcher.onDidDelete(async () => {
      console.log(`Local config file deleted: ${localConfigPath}`);
      const currentLocalConfigPath = workspace.getConfiguration("abaplint").get("localConfigPath", "");
      await client.sendRequest("abaplint/config/reload/request", {localConfigPath: currentLocalConfigPath});
      help.refresh();
    });

    console.log(`Watching local config file: ${localConfigPath}`);
  } catch (error) {
    console.error(`Failed to set up local config watcher: ${error}`);
  }
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
      localConfigPath: workspace.getConfiguration("abaplint").get("localConfigPath", ""),
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
    const debugOptions = {execArgv: ["--nolazy", "--inspect=6011"]};
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

  // Register command to load a different config file
  context.subscriptions.push(
    vscode.commands.registerCommand("abaplint.load.different.config", async () => {
      try {
        // Show file picker to select config file
        const selectedFiles = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'JSON Files': ['json', 'jsonc', 'json5'],
            'All Files': ['*']
          },
          title: 'Select abaplint Configuration File'
        });

        if (!selectedFiles || selectedFiles.length === 0) {
          return; // User cancelled
        }

        const selectedPath = selectedFiles[0].fsPath;

        // Validate the file exists and is readable
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(selectedPath));
        } catch (error) {
          vscode.window.showErrorMessage(`Cannot access file: ${selectedPath}`);
          return;
        }

        // Update the localConfigPath setting
        try {
          await workspace.getConfiguration("abaplint").update(
            "localConfigPath",
            selectedPath,
            vscode.ConfigurationTarget.Workspace
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update configuration: ${error}`);
          return;
        }

        // Set up new file watcher for the selected file
        setupLocalConfigWatcher(context, selectedPath);

        // Reload config from server with the new localConfigPath
        await client.sendRequest("abaplint/config/reload/request", {localConfigPath: selectedPath});

        // Refresh help page if it's open
        help.refresh();

        // Show success message
        vscode.window.showInformationMessage(`Config loaded from: ${selectedPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Error loading config file: ${error}`);
        console.error("Error in load.different.config command:", error);
      }
    })
  );

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

    // Listen for config reload notifications from server
    client.onNotification("abaplint/config/reloaded", (data: {configPath?: string}) => {
      console.log(`Config reloaded notification received. Config path: ${data.configPath || 'undefined'}`);
      // Refresh help page if it's open
      help.refresh();
    });

    // Set up watcher for local config file if configured
    const localConfigPath = workspace.getConfiguration("abaplint").get("localConfigPath", "");
    setupLocalConfigWatcher(context, localConfigPath);
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
