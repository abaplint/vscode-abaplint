import * as fs from "fs";
import * as glob from "glob";
import * as LServer from "vscode-languageserver";
import * as abaplint from "abaplint";
import {URI} from "vscode-uri";
import {Setup} from "./setup";
import {WorkDoneProgress} from "vscode-languageserver/lib/progress";

export interface IFolder {
  root: string;
  glob: string;
}

class Progress implements abaplint.IProgress {
  private readonly progress: WorkDoneProgress;
//  private total: number;
  private current: number;

  public constructor(progress: WorkDoneProgress) {
    this.progress = progress;
  }

  public set(_total: number, _text: string): void {
//    this.progress.report(text);
//    this.total = total;
    this.current = 0;
  }

  public async tick(text: string) {
    this.current++;
    // todo, change this to be time based, eg every 2 seconds
    if (this.current % 75 === 0) {
      this.progress.report(30, text);
      // hack
      await new Promise((resolve) => {setTimeout(resolve, 0); });
    }
  }
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

  public onHighlightReads(doc: {uri: string}) {
    const ranges = new abaplint.LanguageServer(this.reg).listReadPositions(doc);
    this.connection.sendNotification("abaplint/highlight/reads/response", {ranges, uri: doc.uri});
  }

  public onHighlightWrites(doc: {uri: string}) {
    const ranges = new abaplint.LanguageServer(this.reg).listWritePositions(doc);
    this.connection.sendNotification("abaplint/highlight/writes/response", {ranges, uri: doc.uri});
  }

  public onDefinition(params: LServer.TextDocumentPositionParams): LServer.Location | undefined {
    return new abaplint.LanguageServer(this.reg).gotoDefinition(params);
  }

  public onDocumentFormatting(params: LServer.DocumentFormattingParams): LServer.TextEdit[] {
    // todo, temporary workaround, the options from params should also be passed to abaplint
    const edits = new abaplint.LanguageServer(this.reg).documentFormatting({textDocument: params.textDocument});
    return edits;
  }

  public async loadAndParseAll(progress: WorkDoneProgress) {
    progress.report(10, "Reading files");
    for (const folder of this.folders) {
      const filenames = glob.sync(folder.root + folder.glob, {nosort: true, nodir: true});
      for (const filename of filenames) {
        const raw = await fs.promises.readFile(filename, "utf-8");
        const uri = URI.file(filename).toString();
        this.reg.addFile(new abaplint.MemoryFile(uri, raw.replace(/\r/g, "")));
      }
    }

    progress.report(20, "Parsing files");
    await this.reg.parseAsync(new Progress(progress));
  }

  public updateTooltip() {
    const tooltip = "ABAP version: " + this.reg.getConfig().getVersion() + "\n" +
      "abaplint: " + abaplint.Registry.abaplintVersion() + "\n" +
      "Objects: " + this.reg.getObjects().length;
    this.connection.sendNotification("abaplint/status", {text: "Ready", tooltip});
  }

  public onRename(params: LServer.RenameParams): LServer.WorkspaceEdit | undefined {
    return new abaplint.LanguageServer(this.reg).rename(params);
  }

  public onPrepareRename(params: LServer.TextDocumentPositionParams): {range: LServer.Range, placeholder: string} | undefined {
    const result = new abaplint.LanguageServer(this.reg).prepareRename(params);
    /*
    if (result === undefined) {
// todo, https://github.com/microsoft/vscode/issues/85157
      throw new Error(`abaplint, the element can't be renamed`);
    }
    */
    return result;
  }

  public onCodeAction(params: LServer.CodeActionParams): LServer.CodeAction[] {
    return new abaplint.LanguageServer(this.reg).codeActions(params);
  }

  public onDocumentHighlight(params: LServer.DocumentHighlightParams): LServer.DocumentHighlight[] {
    return new abaplint.LanguageServer(this.reg).documentHighlight(params);
  }

  public onDocumentSymbol(params: LServer.DocumentSymbolParams): LServer.DocumentSymbol[] {
    return new abaplint.LanguageServer(this.reg).documentSymbol(params);
  }

  public onHover(params: LServer.TextDocumentPositionParams): LServer.Hover | undefined {
    return new abaplint.LanguageServer(this.reg).hover(params);
  }

  public onImplementation(params: LServer.TextDocumentPositionParams): LServer.Location[] {
    return new abaplint.LanguageServer(this.reg).implementation(params);
  }

}