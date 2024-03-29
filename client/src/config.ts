import {BaseLanguageClient} from "vscode-languageclient/node";
import * as vscode from "vscode";
import * as Create from "./create";

export class Config {
  private readonly client: BaseLanguageClient;
  private uri: vscode.Uri;

  public constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  public register(context: vscode.ExtensionContext): Config {
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.create.default-config", this.createDefaultConfig.bind(this)));
    return this;
  }

  public createDefaultConfig(uri: vscode.Uri) {
    this.uri = uri;
    this.client.sendRequest("abaplint/config/default/request");
  }

  public defaultConfigResponse(config: string) {
    Create.createConfig(this.uri, config);
  }
}