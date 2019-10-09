import * as fs from "fs";
import * as glob from "glob";
import * as LServer from "vscode-languageserver";
import * as abaplint from "abaplint";
import {URI} from "vscode-uri";
import {Registry} from "abaplint/build/src/registry"; // todo, typing?
import {versionToText} from "abaplint/build/src/version"; // todo, typing?
import {Setup} from "./setup";

export interface IFolder {
  root: string;
  glob: string;
}

export class Handler {
  private folders: IFolder[] = [];
  private reg: Registry;
  private configInfo: string;
  private connection: LServer.Connection;

  constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.connection = connection;

    const setup = new Setup(connection);
    this.folders = setup.determineFolders(params.workspaceFolders);
    this.reg.setConfig(setup.readConfig(this.folders));
  }

  public validateDocument(textDocument: LServer.TextDocument) {
    if (textDocument.uri.match(/^git:/)) {
      return; // ignore git things, triggered by revert code
    }

    const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText().replace(/\r/g, ""));
    try {
      this.reg.updateFile(file);
    } catch  {
      this.reg.addFile(file);
    }

    const diagnostics = new abaplint.LanguageServer(this.reg).diagnostics(textDocument);
    this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
  }

  public onDefinition(_params: LServer.TextDocumentPositionParams): LServer.Location | undefined {
/*
    return {
      uri: _params.textDocument.uri,
      range: LServer.Range.create(10, 0, 10, 0),
    };
*/
    return undefined;
  }

  public onDocumentFormatting(params: LServer.DocumentFormattingParams): LServer.TextEdit[] {
    const edits = new abaplint.LanguageServer(this.reg).documentFormatting(params);
    return edits;
  }

  public loadAndParseAll() {
    this.connection.sendNotification("abaplint/status", {text: "$(sync~spin) Parsing Files"});

    for (const folder of this.folders) {
      const filenames = glob.sync(folder.root + folder.glob, {nosort: true, nodir: true});
      for (const filename of filenames) {
        const raw = fs.readFileSync(filename, "utf-8");
        const uri = URI.file(filename).toString();
        this.reg.addFile(new abaplint.MemoryFile(uri, raw.replace(/\r/g, "")));
      }
    }

    this.reg.parse();

    const tooltip = "ABAP version: " + versionToText(this.reg.getConfig().getVersion()) + "\n" +
      "abaplint: " + Registry.abaplintVersion() + "\n" +
      "config: " + this.configInfo + "\n" +
      "Objects: " + this.reg.getObjects().length;
    this.connection.sendNotification("abaplint/status", {text: "Ready", tooltip});
  }

  public onDocumentSymbol(params: LServer.DocumentSymbolParams): LServer.DocumentSymbol[] {
    return new abaplint.LanguageServer(this.reg).documentSymbol(params);
  }

  public onHover(params: LServer.TextDocumentPositionParams): LServer.Hover | undefined {
    const hover = new abaplint.LanguageServer(this.reg).hover(params);
    return hover;
  }

}