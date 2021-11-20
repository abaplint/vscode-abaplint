import * as vscode from "vscode";

export class ArtifactsTreeProvider implements vscode.TreeDataProvider<Dependency> {
  public getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  public getChildren(): Dependency[] {
    return [new Dependency("label", "version", vscode.TreeItemCollapsibleState.None)];
  }
}

export class Dependency extends vscode.TreeItem {
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