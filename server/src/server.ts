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

  progress.begin("", 0, "Initialize", true);
  handler = await Handler.create(connection, params);
  await handler.loadAndParseAll(progress);
  progress.done();

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

connection.onInitialized(() => {

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
});

connection.onCodeAction((params) => {
  return handler.onCodeAction(params);
});

connection.onDocumentHighlight((params) => {
  return handler.onDocumentHighlight(params);
});

connection.onDefinition((params) => {
  return handler.onDefinition(params);
});

connection.onHover((params) => {
  return handler.onHover(params);
});

connection.onRenameRequest((params) => {
  return handler.onRename(params);
});

connection.onPrepareRename((params) => {
  return handler.onPrepareRename(params);
});

connection.onDocumentFormatting((params) => {
  return handler.onDocumentFormatting(params);
});

connection.onDocumentSymbol((params) => {
  return handler.onDocumentSymbol(params);
});

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose((e) => {
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent((change) => {
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

connection.onImplementation((params) => {
  return handler.onImplementation(params);
});

connection.onReferences((params) => {
  return handler.onReferences(params);
});

connection.onRequest("abaplint/help/request", (data) => {
  handler.onHelp(data.uri, data.position);
});

connection.onRequest("abaplint/highlight/definitions/request", (data) => {
  handler.onHighlightDefinitions(data);
});

connection.onRequest("abaplint/highlight/reads/request", (data) => {
  handler.onHighlightReads(data);
});

connection.onRequest("abaplint/highlight/writes/request", (data) => {
  handler.onHighlightWrites(data);
});

connection.onRequest("abaplint/config/default/request", () => {
  handler.onGetConfig();
});

documents.listen(connection);
connection.listen();
