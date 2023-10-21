import * as vscode from "vscode";
import {ExtensionContext} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient/node";
import {ABAPLINTSCHEME, setDocument} from "./flowProvider";

export class Flows {
  // private panel: vscode.WebviewPanel | undefined;
  private readonly client: BaseLanguageClient;

  public constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  public register(context: ExtensionContext): Flows {
    context.subscriptions.push(vscode.commands.registerCommand("abaplint.dumpstatementflows", this.show.bind(this)));
    return this;
  }

  public async flowResponse(response: string) {
    this.emitter.fire(response);
    const uri = vscode.Uri.parse(`${ABAPLINTSCHEME}:graph.dot`);
    const contents = JSON.parse(response).join("\n\n");
    setDocument(uri, contents);
  }

  private readonly emitter = new vscode.EventEmitter<string>();
  private pending?: Promise<void>;

  public async show() {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return;
    }
    const path = editor.document.uri.path.replace(/\.[^\.]*/, "").replace(/.*\//, "");
    const uri = vscode.Uri.parse(`${ABAPLINTSCHEME}:${path}.dot`);
    setDocument(uri, "Loading");
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {preview: false, viewColumn: vscode.ViewColumn.Beside});

    if (this.pending) {
      await this.pending;
    }
    this.pending = new Promise((resolve) => {
      this.emitter.event((content) => {
        const contents = JSON.parse(content).join("\n\n");
        setDocument(uri, contents);
        this.pending = undefined;
        resolve();
      });
    });

    this.client.sendRequest("abaplint/dumpstatementflows/request", {
      uri: editor.document.uri.toString(),
      position: editor.selection.active,
    });
  }
}
