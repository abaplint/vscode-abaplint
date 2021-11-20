// no abaplint types, but vscode types should be okay in this file

export interface ArtifactInformation {
  type: string,
  name: string,
  description: string,
  mainFile: string,
}

export interface UnitTestInformation {
  global: string,
  testClass: string,
  method: string,
  filename: string,
  start: any,
}