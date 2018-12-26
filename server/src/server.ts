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
    textDocumentSync: documents.syncKind,
    documentFormattingProvider: true,
    documentSymbolProvider: true,
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

connection.onHover((params) => {
  connection.console.log("line: " + params.position.line + ", character: " + params.position.character);
  return undefined;
//  return {contents: {kind: MarkupKind.PlainText, value: "hello from abaplint"}};
//  return {contents: {language: "abap", value: "hello"}};
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

documents.listen(connection);
connection.listen();
