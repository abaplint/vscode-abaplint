import {BrowserMessageReader, BrowserMessageWriter, createConnection as createBrowserConnection} from "vscode-languageserver/browser";
import * as LServer from "vscode-languageserver";

export function createConnection(): LServer.Connection {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  return createBrowserConnection(messageReader, messageWriter);
}
