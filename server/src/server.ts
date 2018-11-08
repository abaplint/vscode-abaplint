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

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.abaplint || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'abaplint'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
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
  let settings = await getDocumentSettings(textDocument.uri);
  let problems = 0;
  let diagnostics: LServer.Diagnostic[] = [];

  for(let issue of analyze(textDocument)) {
    problems++;

    connection.console.log(issue.getMessage().toString());

		let diagnosic: LServer.Diagnostic = {
			severity: LServer.DiagnosticSeverity.Error,
			range: {
				start: { line: issue.getStart().getRow() - 1, character: issue.getStart().getCol() - 1 },
				end: { line: issue.getEnd().getRow() - 1, character: issue.getEnd().getCol() - 1 }
			},
			message: issue.getMessage().toString(),
			source: 'abaplint'
    };
		diagnostics.push(diagnosic);

    if (problems > settings.maxNumberOfProblems) {
      break;
    }
  }

	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
  connection.console.log('We received an file change event');
// todo, update to abaplint.json received
});

documents.listen(connection);
connection.listen();
