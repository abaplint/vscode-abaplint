import * as LServer from "vscode-languageserver";
import * as abaplint from "abaplint";
import * as fs from "fs";
import * as path from "path";

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
    const raw = fs.readFileSync(params.rootPath + path.sep + "abaplint.json", "utf-8");
    config = new abaplint.Config(raw);
  } catch (err) {
    connection.console.log("no custom abaplint config, using defaults");
  }

  return {capabilities: {textDocumentSync: documents.syncKind}};

});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // register for all configuration changes.
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

connection.onDidChangeConfiguration((_change) => { return undefined; });

documents.onDidClose((e) => {
  connection.sendDiagnostics({uri: e.document.uri, diagnostics: []});
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

function analyze(textDocument: LServer.TextDocument) {
  // todo, remove replace when https://github.com/larshp/abaplint/issues/262 is implemented
  const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
  return new abaplint.Registry(config).addFile(file).findIssues();
}

async function validateDocument(textDocument: LServer.TextDocument): Promise<void> {
  const diagnostics: LServer.Diagnostic[] = [];

  for (const issue of analyze(textDocument)) {
    connection.console.log(issue.getMessage().toString());

    const diagnosic: LServer.Diagnostic = {
      severity: LServer.DiagnosticSeverity.Error,
      range: {
        start: {line: issue.getStart().getRow() - 1, character: issue.getStart().getCol() - 1},
        end: {line: issue.getEnd().getRow() - 1, character: issue.getEnd().getCol() - 1},
      },
      code: issue.getCode(),
      message: issue.getMessage().toString(),
      source: "abaplint",
    };
    diagnostics.push(diagnosic);

  }

  connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
}

connection.onDidChangeWatchedFiles((_change) => {
  connection.console.log("We received an file change event");
// todo, update to abaplint.json received
});

documents.listen(connection);
connection.listen();
