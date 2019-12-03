import * as path from "path";
import * as vscode from "vscode";
import {Buffer} from "buffer";

// todo: check for overwriting files
// vscode.window.showErrorMessage("File already exists");

// todo: run formatter on generated ABAP

async function createFile(uri: vscode.Uri, content: string) {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  await vscode.window.showTextDocument(uri, {preview: false});
}

export async function createCLAS(uri: vscode.Uri) {
  const name = await vscode.window.showInputBox({
    placeHolder: "cl_name",
  });
  if (name === undefined || name === "") {
    return;
  }
  const filename = path.parse(uri.fsPath).dir + path.sep + name + ".clas";

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

export async function createINTF(uri: vscode.Uri) {
  const name = await vscode.window.showInputBox({
    placeHolder: "if_name",
  });
  if (name === undefined || name === "") {
    return;
  }
  const filename = path.parse(uri.fsPath).dir + path.sep + name + ".intf";

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