import * as LServer from "vscode-languageserver";
import * as fs from "fs";
import * as path from "path";
import * as abaplint from "abaplint";
import {validateDocument} from "./validate";

const connection = LServer.createConnection(LServer.ProposedFeatures.all);
let config = abaplint.Config.getDefault();

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

  try {
    const raw = fs.readFileSync(params.rootPath + path.sep + "abaplint.json", "utf-8"); // todo, rootPath is deprecated
    config = new abaplint.Config(raw);
  } catch (err) {
    connection.console.log("no custom abaplint config, using defaults");
  }

  return {capabilities: {
    textDocumentSync: documents.syncKind,
    documentSymbolProvider: true,
    hoverProvider: true,
  }};
});

connection.onInitialized(() => {

  connection.sendNotification("abaplint/hello", "hello world");

  if (hasConfigurationCapability) {
    connection.client.register(
      LServer.DidChangeConfigurationNotification.type,
      undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

connection.onHover((_position) => {
  return undefined;
//  return {contents: {kind: MarkupKind.PlainText, value: "hello from abaplint"}};
//  return {contents: {language: "abap", value: "hello"}};
});

connection.onDocumentSymbol((_params) => {
  return [];
  /*
  const symbol: LServer.SymbolInformation = {
    name: "class_name",
    kind: LServer.SymbolKind.Class,
    location: LServer.Location.create(params.textDocument.uri, LServer.Range.create(10, 0, 20, 0))};
  const prop: LServer.SymbolInformation = {
    name: "method_name",
    kind: LServer.SymbolKind.Method,
    location: LServer.Location.create(params.textDocument.uri, LServer.Range.create(12, 0, 13, 0)),
    containerName: "class_name"};
  return [symbol, prop];
  */
});

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose((e) => {
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document, connection, config);
});

connection.onDidChangeWatchedFiles((_change) => {
  connection.console.log("We received an file change event");
// todo, update to abaplint.json received
});

documents.listen(connection);
connection.listen();
