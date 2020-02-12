import * as LServer from "vscode-languageserver";
import {TextDocument} from "vscode-languageserver-textdocument";
import {Handler} from "./handler";

const connection = LServer.createConnection(LServer.ProposedFeatures.all);
let handler: Handler;

// create a simple text document manager. The text document manager
// supports full document sync only
const documents = new LServer.TextDocuments(TextDocument);
let hasConfigurationCapability: boolean | undefined = false;
let hasWorkspaceFolderCapability: boolean | undefined = false;

connection.onInitialize(async (params: LServer.InitializeParams, _cancel, progress) => {

  const capabilities = params.capabilities;

  // does the client support the `workspace/configuration` request?
  // if not, we will fall back using global settings
  hasConfigurationCapability =
    capabilities.workspace && !!capabilities.workspace.configuration;
  hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;

  progress.begin("abaplint", 0, "Initialize", true);
  handler = new Handler(connection, params);
  await handler.loadAndParseAll(progress);
  progress.done();

  const result: LServer.InitializeResult = {capabilities: {
    /*
    signatureHelpProvider: [],
    completionProvider
    referencesProvider
    codeLensProvider
    */
    textDocumentSync: LServer.TextDocumentSyncKind.Full,
    documentFormattingProvider: true,
    definitionProvider: true,
    codeActionProvider: true,
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
  connection.console.log("We received an file change event");
// todo, update to abaplint.json received
});

connection.onImplementation((params) => {
  return handler.onImplementation(params);
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

documents.listen(connection);
connection.listen();
