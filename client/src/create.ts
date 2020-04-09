import * as path from "path";
import * as vscode from "vscode";
import {Buffer} from "buffer";

// todo: run formatter on generated ABAP

async function createFile(uri: vscode.Uri, content: string) {

  if (await fileExists(uri)) {
    vscode.window.showErrorMessage("File already exists!");
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  await vscode.window.showTextDocument(uri, {preview: false});
}

async function findFolder(uri: vscode.Uri) {
  const parsed = path.parse(uri.fsPath);
  const stat = await vscode.workspace.fs.stat(uri);
  return stat.type === vscode.FileType.File ?
    parsed.dir + path.sep :
    parsed.dir + path.sep + parsed.base + path.sep;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export async function createArtifact(uri: vscode.Uri) {
  const type = await vscode.window.showQuickPick(["Class", "Interface"]);
  if (type === undefined || type === "") {
    return;
  }

  switch (type) {
    case "Class":
      await createCLAS(uri);
      break;
    case "Interface":
      await createINTF(uri);
      break;
    default:
      break;
  }

}

async function createCLAS(uri: vscode.Uri) {

  const name = await vscode.window.showInputBox({
    placeHolder: "cl_name",
  });
  if (name === undefined || name === "") {
    return;
  }

  const dir = await findFolder(uri);
  const filename = dir + name.toLowerCase() + ".clas";

  const uriXML = vscode.Uri.file(filename + ".xml");
  const dataXML = `<?xml version="1.0" encoding="utf-8"?>
<abapGit version="v1.0.0" serializer="LCL_OBJECT_CLAS" serializer_version="v1.0.0">
 <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
   <VSEOCLASS>
    <CLSNAME>${name.toUpperCase()}</CLSNAME>
    <LANGU>E</LANGU>
    <DESCRIPT>Description</DESCRIPT>
    <STATE>1</STATE>
    <CLSCCINCL>X</CLSCCINCL>
    <FIXPT>X</FIXPT>
    <UNICODE>X</UNICODE>
   </VSEOCLASS>
  </asx:values>
 </asx:abap>
</abapGit>`;
  await createFile(uriXML, dataXML);

  const uriABAP = vscode.Uri.file(filename + ".abap");
  const dataABAP = `CLASS ${name.toLowerCase()} DEFINITION PUBLIC.

ENDCLASS.

CLASS ${name.toLowerCase()} IMPLEMENTATION.

ENDCLASS.`;
  await createFile(uriABAP, dataABAP);
}

async function createINTF(uri: vscode.Uri) {
  const name = await vscode.window.showInputBox({
    placeHolder: "if_name",
  });
  if (name === undefined || name === "") {
    return;
  }

  const dir = await findFolder(uri);
  const filename = dir + name.toLowerCase() + ".intf";

  const uriXML = vscode.Uri.file(filename + ".xml");
  const dataXML = `<?xml version="1.0" encoding="utf-8"?>
<abapGit version="v1.0.0" serializer="LCL_OBJECT_INTF" serializer_version="v1.0.0">
 <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
   <VSEOINTERF>
    <CLSNAME>${name.toUpperCase()}</CLSNAME>
    <LANGU>E</LANGU>
    <DESCRIPT>Description</DESCRIPT>
    <EXPOSURE>2</EXPOSURE>
    <STATE>1</STATE>
    <UNICODE>X</UNICODE>
   </VSEOINTERF>
  </asx:values>
 </asx:abap>
</abapGit>`;
  await createFile(uriXML, dataXML);

  const uriABAP = vscode.Uri.file(filename + ".abap");
  const dataABAP = `INTERFACE ${name.toLowerCase()} PUBLIC.

ENDINTERFACE.`;
  await createFile(uriABAP, dataABAP);
}