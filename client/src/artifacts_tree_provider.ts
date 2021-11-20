import * as vscode from "vscode";
import {CommonLanguageClient} from "vscode-languageclient";
import {ArtifactInformation} from "./common_types";

export class ArtifactsTreeProvider implements vscode.TreeDataProvider<ArtifactTreeItem> {
  private readonly client: CommonLanguageClient;
  private items: ArtifactInformation[] = [];

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

  public async getChildren(_parent?: ArtifactTreeItem): Promise<ArtifactTreeItem[]> {
    await this.client.onReady();

    this.items = [];
    await this.client.sendRequest("abaplint/artifacts/list/request");

    const treeItems: ArtifactTreeItem[] = [];
    for (const i of this.items) {
      treeItems.push(new ArtifactTreeItem(i));
    }
    return treeItems;
  }

  private response(data: any) {
    this.items = data;
  }
}

export class ArtifactTreeItem extends vscode.TreeItem {
  public constructor(info: ArtifactInformation) {
    super(info.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = info.type;
    this.description = info.description;
    this.resourceUri = vscode.Uri.parse(info.mainFile);

    this.command = {
      command: "vscode.open",
      title: "",
      arguments: [this.resourceUri],
    };
  }

  public contextValue = "abaplint-artifacts-context";
}