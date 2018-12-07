'use strict';

import * as LServer from 'vscode-languageserver';
import * as abaplint from "abaplint";
import * as fs from 'fs';
import * as path from 'path';

let connection = LServer.createConnection(LServer.ProposedFeatures.all);
let config = abaplint.Config.getDefault();

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: LServer.TextDocuments = new LServer.TextDocuments();
let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: LServer.InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		capabilities.workspace && !!capabilities.workspace.configuration;
	hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;

  try {
    let raw = fs.readFileSync(params.rootPath + path.sep + "abaplint.json", "utf-8");
    config = new abaplint.Config(raw);
  } catch (err) {
    connection.console.log("no custom abaplint config: " + err.message);
  }

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
		}
  };

});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			LServer.DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

connection.onDidChangeConfiguration(_change => {});

documents.onDidClose(e => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.onDidChangeContent(change => {
	validateDocument(change.document);
});

function analyze(textDocument: LServer.TextDocument) {
  // todo, remove replace when https://github.com/larshp/abaplint/issues/262 is implemented
  let file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
  return new abaplint.Registry(config).addFile(file).findIssues();
}

async function validateDocument(textDocument: LServer.TextDocument): Promise<void> {
  let diagnostics: LServer.Diagnostic[] = [];

  for(let issue of analyze(textDocument)) {
    connection.console.log(issue.getMessage().toString());

		let diagnosic: LServer.Diagnostic = {
			severity: LServer.DiagnosticSeverity.Error,
			range: {
				start: { line: issue.getStart().getRow() - 1, character: issue.getStart().getCol() - 1 },
				end: { line: issue.getEnd().getRow() - 1, character: issue.getEnd().getCol() - 1 }
      },
      code: issue.getCode(),
			message: issue.getMessage().toString(),
			source: 'abaplint'
    };
		diagnostics.push(diagnosic);

  }

	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
  connection.console.log('We received an file change event');
// todo, update to abaplint.json received
});

documents.listen(connection);
connection.listen();
