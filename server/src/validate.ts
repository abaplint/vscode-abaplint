import * as LServer from "vscode-languageserver";
import * as abaplint from "abaplint";

function analyze(textDocument: LServer.TextDocument, config: any) {
  // todo, remove replace when https://github.com/larshp/abaplint/issues/262 is implemented
  const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
  return new abaplint.Registry(config).addFile(file).findIssues();
}

export async function validateDocument(textDocument: LServer.TextDocument, connection: LServer.Connection, config: any): Promise<void> {
  const diagnostics: LServer.Diagnostic[] = [];

  for (const issue of analyze(textDocument, config)) {
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