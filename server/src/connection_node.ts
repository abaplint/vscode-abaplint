import * as LServer from "vscode-languageserver/node";

export function createConnection(): LServer.Connection {
  return LServer.createConnection(LServer.ProposedFeatures.all);
}
