import * as vscode from "vscode";
import {CommonLanguageClient} from "vscode-languageclient";

export class ArtifactsTreeProvider implements vscode.TreeDataProvider<ArtifactTreeItem> {
  private readonly client: CommonLanguageClient;

  public constructor(client: CommonLanguageClient) {
    this.client = client;

    this.client.onReady().then(() => {
      client.onNotification("abaplint/artifacts/list/response", (data) => {
        this.response(data);
      });
    });
  }

  public getTreeItem(element: ArtifactTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): ArtifactTreeItem[] {
    this.client.onReady().then(() => {
      this.client.sendRequest("abaplint/artifacts/list/request");
    });
    return [new ArtifactTreeItem("label", "version", vscode.TreeItemCollapsibleState.None)];
  }

  private response(data: any) {
    console.log("Artifacts list response");
    console.dir(data);
  }
}

export class ArtifactTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly label: string,
    private readonly version: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}-${this.version}`;
    this.description = this.version;
  }

  public contextValue = "abaplint-artifacts-context";
}