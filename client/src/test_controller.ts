import * as vscode from "vscode";
import {CommonLanguageClient} from "vscode-languageclient";
import {UnitTestInformation} from "./common_types";

const ABAPLINT_LOADING = "abaplint_loading";

export class TestController {
  private readonly testController: vscode.TestController;

  public constructor(client: CommonLanguageClient) {
    this.testController = vscode.tests.createTestController("abaplintTests", "abaplint Tests");
    const testItem = this.testController.createTestItem(ABAPLINT_LOADING, "loading abaplint");
    testItem.busy = true;
    this.testController.items.add(testItem);

    client.onReady().then(() => {
      client.onNotification("abaplint/unittests/list/response", (data) => {
        this.response(data);
      });
      client.sendRequest("abaplint/unittests/list/request");
    });
  }

  public response(data: UnitTestInformation[]) {
    this.testController.items.delete(ABAPLINT_LOADING);
    for (const t of data) {
      const globalName = `abaplint-${t.global}`;
      let globalItem = this.testController.items.get(globalName);
      if (globalItem === undefined) {
        globalItem = this.testController.createTestItem(globalName, t.global);
        this.testController.items.add(globalItem);
      }

      const className = `abaplint-${t.global}-${t.testClass}`;
      let classItem = globalItem.children.get(className);
      if (classItem === undefined) {
        classItem = this.testController.createTestItem(className, t.testClass);
        globalItem.children.add(classItem);
      }

      const testName = `abaplint-${t.global}-${t.testClass}-${t.method}`;
      const add = this.testController.createTestItem(testName, t.method, vscode.Uri.parse(t.filename));
      add.range = new vscode.Range(
        new vscode.Position(t.start.row - 1, t.start.col - 1),
        new vscode.Position(t.start.row - 1, t.start.col - 1 + t.method.length));
      classItem.children.add(add);
    }
  }
}