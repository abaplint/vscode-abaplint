import * as fs from "fs";
import * as glob from "glob";
import * as LServer from "vscode-languageserver";
import * as abaplint from "abaplint";
import {URI} from "vscode-uri";
import {Setup} from "./setup";

export interface IFolder {
  root: string;
  glob: string;
}

export class Handler {
  private folders: IFolder[] = [];
  private reg: abaplint.Registry;
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

  public onHelp(uri: string, position: LServer.Position) {
    const help = new abaplint.LanguageServer(this.reg).help({uri: uri}, position);
    this.connection.sendNotification("abaplint/help/response", help);
  }

  public onHighlightDefinitions(doc: {uri: string}) {
    const ranges = new abaplint.LanguageServer(this.reg).listDefinitionPositions(doc);
    this.connection.sendNotification("abaplint/highlight/definitions/response", {ranges, uri: doc.uri});
  }

  public onDefinition(params: LServer.TextDocumentPositionParams): LServer.Location | undefined {
    return new abaplint.LanguageServer(this.reg).gotoDefinition(params);
  }

  public onDocumentFormatting(params: LServer.DocumentFormattingParams): LServer.TextEdit[] {
    // todo, temporary workaround, the options from params should also be passed to abaplint
    const edits = new abaplint.LanguageServer(this.reg).documentFormatting({textDocument: params.textDocument});
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

    const tooltip = "ABAP version: " + this.reg.getConfig().getVersion() + "\n" +
      "abaplint: " + abaplint.Registry.abaplintVersion() + "\n" +
      "Objects: " + this.reg.getObjects().length;
    this.connection.sendNotification("abaplint/status", {text: "Ready", tooltip});
  }

  public onRename(params: LServer.RenameParams): LServer.WorkspaceEdit | undefined {
    const result = new abaplint.LanguageServer(this.reg).rename(params);
    if (result === undefined) {
      return result;
    }
    return result;
  }

  public onPrepareRename(params: LServer.TextDocumentPositionParams): {range: LServer.Range, placeholder: string} | undefined {
    const result = new abaplint.LanguageServer(this.reg).prepareRename(params);
    if (result === undefined) {
// todo, https://github.com/microsoft/vscode/issues/85157
      throw new Error(`abaplint, the element can't be renamed`);
    }
    return result;
  }

  public onCodeAction(_params: LServer.CodeActionParams): LServer.CodeAction[] {
// todo, call abaplint
    return [];
  }

  public onDocumentHighlight(_params: LServer.DocumentHighlightParams): LServer.DocumentHighlight[] {
// todo, call abaplint
    return [];
  }

  public onDocumentSymbol(params: LServer.DocumentSymbolParams): LServer.DocumentSymbol[] {
    return new abaplint.LanguageServer(this.reg).documentSymbol(params);
  }

  public onHover(params: LServer.TextDocumentPositionParams): LServer.Hover | undefined {
    const hover = new abaplint.LanguageServer(this.reg).hover(params);
    return hover;
  }

}