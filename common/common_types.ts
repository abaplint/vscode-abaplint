// no abaplint types, but vscode types should be okay in this file

export interface UnitTestInformation {
  global: string,
  testClass: string,
  method: string,
  filename: string,
  start: any,
}