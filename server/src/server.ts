import * as LServer from "vscode-languageserver";
import {Handler} from "./handler";

const connection = LServer.createConnection(LServer.ProposedFeatures.all);
let handler: Handler;

// create a simple text document manager. The text document manager
// supports full document sync only
const documents: LServer.TextDocuments = new LServer.TextDocuments();
let hasConfigurationCapability: boolean | undefined = false;
let hasWorkspaceFolderCapability: boolean | undefined = false;

connection.onInitialize((params: LServer.InitializeParams) => {
  const capabilities = params.capabilities;

  // does the client support the `workspace/configuration` request?
  // if not, we will fall back using global settings
  hasConfigurationCapability =
    capabilities.workspace && !!capabilities.workspace.configuration;
  hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;

  handler = new Handler(connection, params);

  return {capabilities: {
    /*
    signatureHelpProvider: [],
    completionProvider
    referencesProvider
    codeActionProvider
    codeLensProvider
    */
    textDocumentSync: documents.syncKind,
    documentFormattingProvider: true,
    definitionProvider: true,
    documentSymbolProvider: true,
    renameProvider: {prepareProvider: true},
    hoverProvider: true,
  }};
});

connection.onInitialized(() => {

  handler.loadAndParseAll();

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

connection.onRequest("abaplint/helpRequest", (data) => {
  handler.onHelp(data.uri, data.position);
});

documents.listen(connection);
connection.listen();
