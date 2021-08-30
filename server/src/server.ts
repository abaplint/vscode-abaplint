import {createConnection as createBrowserConnection, BrowserMessageReader, BrowserMessageWriter} from "vscode-languageserver/browser";
import * as LServer from "vscode-languageserver/node";
import * as fs from "fs";
import {TextDocument} from "vscode-languageserver-textdocument";
import {Handler} from "./handler";
import {FsProvider, FileOperations} from "./file_operations";

let connection: LServer.Connection;
if (fs.read === undefined) {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  connection = createBrowserConnection(messageReader, messageWriter);
} else {
  connection = LServer.createConnection(LServer.ProposedFeatures.all);
}

// create a simple text document manager. The text document manager
// supports full document sync only
const documents = new LServer.TextDocuments(TextDocument);
let hasConfigurationCapability: boolean | undefined = false;
let hasWorkspaceFolderCapability: boolean | undefined = false;

function initialize() {

  const handlerParams = new Promise<LServer.InitializeParams>((resolve, reject) => {
    connection.onInitialize(async (params: LServer.InitializeParams, _cancel) => {
      try {
        const capabilities = params.capabilities;
        const {provideFsProxy = false} = params.initializationOptions;
        if (provideFsProxy) {
          const provider: FsProvider = {
            readFile:(path: string) => connection.sendRequest("readFile", path),
            exists:(path: string) => connection.sendRequest("unlink", path),
            isDirectory:(path: string) => connection.sendRequest("exists", path),
            unlink:(path: string) => connection.sendRequest("unlink", path),
            rmdir:(path: string) => connection.sendRequest("rmdir", path),
            readdir:(path: string) => connection.sendRequest("readdir", path),
            glob:(pattern: string) => connection.sendRequest("glob", pattern),
          };
          FileOperations.setProvider(provider);
        }

    // does the client support the `workspace/configuration` request?
    // if not, we will fall back using global settings
        hasConfigurationCapability =
      capabilities.workspace && !!capabilities.workspace.configuration;
        hasWorkspaceFolderCapability =
      capabilities.workspace && !!capabilities.workspace.workspaceFolders;

        const result: LServer.InitializeResult = {
          capabilities: {
      /*
      signatureHelpProvider: [],
      completionProvider
      codeLensProvider
      */
            textDocumentSync: LServer.TextDocumentSyncKind.Full,
            documentFormattingProvider: true,
            definitionProvider: true,
            codeActionProvider: true,
            referencesProvider: true,
            documentHighlightProvider: true,
            documentSymbolProvider: true,
            implementationProvider: true,
            renameProvider: {prepareProvider: true},
            hoverProvider: true,
          }};
        resolve(params);
        return result;
        //
      } catch (error) {
        reject(error);
        throw error;
      }
    });
  });

  const initialized = new Promise((resolve, reject) => {
    connection.onInitialized(async () => {
      try {
        if (hasConfigurationCapability) {
          connection.client.register(
            LServer.DidChangeConfigurationNotification.type,
            undefined);
        }
        if (hasWorkspaceFolderCapability) {
          connection.workspace.onDidChangeWorkspaceFolders((_event) => {
          // todo, handle event
            connection.console.log("Workspace folder change event received.");
          });
        }
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });

  let handler: Promise<Handler>;

  const createHandler = async() => {
    await initialized;
    const params = await handlerParams;
    const progress = await connection.window.createWorkDoneProgress();
    progress.begin("", 0, "Initialize");
    const handler = await Handler.create(connection, params);
    await handler.loadAndParseAll(progress);
    progress.done();
    handler.updateTooltip();
    return handler;
  };

  return () => {
    if (!handler) {handler = createHandler();}
    return handler;
  };
}

const getHandler = initialize();

connection.onCodeAction(async(params) => {
  const handler = await getHandler();
  return handler.onCodeAction(params);
});

connection.onDocumentHighlight(async(params) => {
  const handler = await getHandler();
  return handler.onDocumentHighlight(params);
});

connection.onDefinition(async(params) => {
  const handler = await getHandler();
  return handler.onDefinition(params);
});

connection.onHover(async(params) => {
  const handler = await getHandler();
  return handler.onHover(params);
});

connection.onRenameRequest(async(params) => {
  const handler = await getHandler();
  return handler.onRename(params);
});

connection.onPrepareRename(async(params) => {
  const handler = await getHandler();
  return handler.onPrepareRename(params);
});

connection.onDocumentFormatting(async(params) => {
  const handler = await getHandler();
  return handler.onDocumentFormatting(params);
});

connection.onDocumentSymbol(async(params) => {
  const handler = await getHandler();
  return handler.onDocumentSymbol(params);
});

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose(async (e) => {
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent(async (change) => {
  const handler = await getHandler();
  handler.validateDocument(change.document);
});

// todo, documents.onDelete, how are file deletions handled ?

connection.onDidChangeWatchedFiles(async (_change) => {
  connection.console.log("We received a file change event");
  const handler = await getHandler();
  for (const change of _change.changes.values()) {
    if (change.uri.includes("abaplint.json")) {
      connection.console.log("abaplint.json was changed, reloading...");
      handler.configChanged(documents);
      break;
    }
  }
});

connection.onImplementation(async(params) => {
  const handler = await getHandler();
  return handler.onImplementation(params);
});

connection.onReferences(async (params) => {
  const handler = await getHandler();
  return handler.onReferences(params);
});

connection.onRequest("abaplint/help/request", async (data) => {
  const handler = await getHandler();
  handler.onHelp(data.uri, data.position);
});

connection.onRequest("abaplint/highlight/definitions/request", async (data) => {
  const handler = await getHandler();
  handler.onHighlightDefinitions(data);
});

connection.onRequest("abaplint/highlight/reads/request", async (data) => {
  const handler = await getHandler();
  handler.onHighlightReads(data);
});

connection.onRequest("abaplint/highlight/writes/request", async (data) => {
  const handler = await getHandler();
  handler.onHighlightWrites(data);
});

connection.onRequest("abaplint/config/default/request", async () => {
  const handler = await getHandler();
  handler.onGetConfig();
});

documents.listen(connection);
connection.listen();
