import {createConnection as createBrowserConnection, BrowserMessageReader, BrowserMessageWriter} from "vscode-languageserver/browser";
import * as LServer from "vscode-languageserver/node";
import * as fs from "fs";
import * as abaplint from "@abaplint/core";
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

let experimentalFormatting = false;
let formattingDisabled: string[] = [];

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
        if (params.initializationOptions.provideFsProxy === true) {
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

        let tokensProvider: LServer.SemanticTokensOptions | undefined = undefined;
        if (params.initializationOptions.enableSemanticHighlighting === true) {
          tokensProvider = {
            legend: abaplint.LanguageServer.semanticTokensLegend(),
            range: true,
            // full: { delta: false},
          };
        }

        let codeLensProvider: LServer.CodeLensOptions | undefined = {
          resolveProvider: false,
        };
        if (params.initializationOptions.codeLens?.messageTexts === false) {
          codeLensProvider = undefined;
        }

        let inlayHintProvider: LServer.InlayHintOptions | undefined = {
          resolveProvider: false,
        };
        if (params.initializationOptions.inlayHints?.inferredTypes === false) {
          inlayHintProvider = undefined;
        }

        let documentFormattingProvider = true;
        if (params.initializationOptions.formatting?.enable === false) {
          documentFormattingProvider = false;
        }
        if (params.initializationOptions.formatting?.disabled !== undefined) {
          formattingDisabled = params.initializationOptions.formatting.disabled;
        }
        if (params.initializationOptions.formatting?.experimental === true) {
          experimentalFormatting = true;
        }

    // does the client support the `workspace/configuration` request?
    // if not, we will fall back using global settings
        hasConfigurationCapability = capabilities.workspace && !!capabilities.workspace.configuration;
        hasWorkspaceFolderCapability = capabilities.workspace && !!capabilities.workspace.workspaceFolders;

        /*
        signatureHelpProvider: [],
        completionProvider
        inlineValueProvider // same as inlay hints, but at end of line?
        typeDefinitionProvider // "goto type definition"
        typeHierarchyProvider // super/sub classes listing
        */
        const result: LServer.InitializeResult = {
          capabilities: {
            semanticTokensProvider: tokensProvider,
            textDocumentSync: LServer.TextDocumentSyncKind.Full,
            documentFormattingProvider: documentFormattingProvider,
            definitionProvider: true,
            codeLensProvider: codeLensProvider,
            inlayHintProvider: inlayHintProvider,
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
          connection.client.register(LServer.DidChangeConfigurationNotification.type, undefined);
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
    connection.console.log("call loadAndParseAll");
    await handler.loadAndParseAll(progress);
    connection.console.log("loadAndParseAll done");
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

connection.languages.semanticTokens.onRange(async (params) => {
  const handler = await getHandler();
  return handler.onSemanticTokensRange(params);
});

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

connection.languages.inlayHint.on(async(params) => {
  const handler = await getHandler();
  return handler.onInlayHint(params);
});

connection.onDocumentFormatting(async(params) => {
  const handler = await getHandler();
  return handler.onDocumentFormatting(params, experimentalFormatting, formattingDisabled);
});

connection.onDocumentSymbol(async(params) => {
  const handler = await getHandler();
  return handler.onDocumentSymbol(params);
});

connection.onCodeLens(async(params) => {
  const handler = await getHandler();
  return handler.onCodeLens(params);
});

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose(async (e) => {
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent(async (change) => {
  const handler = await getHandler();
  handler.validateDocument(change.document);
});

// todo, documents.onDelete, how are file deletions handled ? possible via language server protocol 3.16.0

connection.onDidChangeWatchedFiles(async (_change) => {
  connection.console.log("File change event received");
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

connection.onRequest("abaplint/dumpstatementflows/request", async (data) => {
  const handler = await getHandler();
  handler.onDumpStatementFlows(data);
});

connection.onRequest("abaplint/config/default/request", async () => {
  const handler = await getHandler();
  handler.onRequestConfig();
});

connection.onRequest("abaplint/unittests/list/request", async () => {
  const handler = await getHandler();
  handler.onListUnitTests();
});

documents.listen(connection);
connection.listen();
