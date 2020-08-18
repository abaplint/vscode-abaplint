import * as LServer from "vscode-languageserver";
import {TextDocument} from "vscode-languageserver-textdocument";
import {Handler} from "./handler";
import {registerProvider} from "./fs_provider";

const connection = LServer.createConnection(LServer.ProposedFeatures.all);
let handler: Handler;

// create a simple text document manager. The text document manager
// supports full document sync only
const documents = new LServer.TextDocuments(TextDocument);
let hasConfigurationCapability: boolean | undefined = false;
let hasWorkspaceFolderCapability: boolean | undefined = false;
let createHandler = ()=>Promise.resolve();

connection.onInitialize(async (params: LServer.InitializeParams, _cancel, progress) => {

  const capabilities = params.capabilities;
  const {provideFsProxy = false} = params.initializationOptions;
  if(provideFsProxy) {registerProvider(connection);}

  // does the client support the `workspace/configuration` request?
  // if not, we will fall back using global settings
  hasConfigurationCapability =
    capabilities.workspace && !!capabilities.workspace.configuration;
  hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;

  createHandler = async ()=>{
    progress.begin("", 0, "Initialize", true);
    handler = await Handler.create(connection, params);
    await handler.loadAndParseAll(progress);
    progress.done();
  };
  if(!provideFsProxy) {await createHandler();}
  // await createHandler();

  const result: LServer.InitializeResult = {capabilities: {
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

  return result;
});
const initialized = new Promise((resolve,reject)=>{
  connection.onInitialized(async () => {
    try {
      if(!handler){ await createHandler();}
      handler.updateTooltip();

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

connection.onCodeAction(async(params) => {
  await initialized;
  return handler.onCodeAction(params);
});

connection.onDocumentHighlight(async(params) => {
  await initialized;
  return handler.onDocumentHighlight(params);
});

connection.onDefinition(async(params) => {
  await initialized;
  return handler.onDefinition(params);
});

connection.onHover(async(params) => {
  await initialized;
  return handler.onHover(params);
});

connection.onRenameRequest(async(params) => {
  await initialized;
  return handler.onRename(params);
});

connection.onPrepareRename(async(params) => {
  await initialized;
  return handler.onPrepareRename(params);
});

connection.onDocumentFormatting(async(params) => {
  await initialized;
  return handler.onDocumentFormatting(params);
});

connection.onDocumentSymbol(async(params) => {
  await initialized;
  return handler.onDocumentSymbol(params);
});

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose(async (e) => {
  await initialized;
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent(async (change) => {
  await initialized;
  handler.validateDocument(change.document);
});

// todo, documents.onDelete, how are file deletions handled ?

connection.onDidChangeWatchedFiles((_change) => {
  connection.console.log("We received a file change event");
  for (const change of _change.changes.values()) {
    if (change.uri.endsWith("abaplint.json")) {
      connection.console.log("abaplint.json was changed, reloading...");
      handler.configChanged(documents);
      break;
    }
  }
});

connection.onImplementation(async(params) => {
  await initialized;
  return handler.onImplementation(params);
});

connection.onReferences(async (params) => {
  await initialized;
  return handler.onReferences(params);
});

connection.onRequest("abaplint/help/request", (data) => {
  handler.onHelp(data.uri, data.position);
});

connection.onRequest("abaplint/highlight/definitions/request", async (data) => {
  await initialized;
  handler.onHighlightDefinitions(data);
});

connection.onRequest("abaplint/highlight/reads/request", async (data) => {
  await initialized;
  handler.onHighlightReads(data);
});

connection.onRequest("abaplint/highlight/writes/request", async (data) => {
  await initialized;
  handler.onHighlightWrites(data);
});

connection.onRequest("abaplint/config/default/request", async () => {
  await initialized;
  handler.onGetConfig();
});

documents.listen(connection);
connection.listen();
