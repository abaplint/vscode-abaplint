import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";
import {URI} from "vscode-uri";
import {Setup} from "./setup";
import {WorkDoneProgressReporter} from "vscode-languageserver/lib/common/progress";
import {TextDocument} from "vscode-languageserver-textdocument";
import {FileOperations} from "./file_operations";
import {GitOperations} from "./git";

export interface IFolder {
  root: string;
  scheme: string;
  authority: string;
  glob: string;
}

class Progress implements abaplint.IProgress {
  private readonly renderThrottle = 2000;
  private readonly progress: WorkDoneProgressReporter;
  private total: number;
  private lastRender: number;
  private current: number;

  public constructor(progress: WorkDoneProgressReporter) {
    this.progress = progress;
  }

  public set(total: number, _text: string): void {
    this.total = total;
    this.current = 0;
    this.lastRender = 0;
  }

  public tickSync(_text: string) {
    return;
  }

  public async tick(text: string) {
    this.current++;

    // dont run the logic too often
    if (this.current % 10 !== 0) {
      return;
    }

    const now = Date.now();
    const delta = now - this.lastRender;
    // only update progress every this.throttle milliseconds
    if (delta > this.renderThrottle) {
      const percent = Math.floor((this.current / this.total) * 100);
      this.progress.report(percent, text);
      // hack
      await new Promise((resolve) => {setTimeout(resolve, 0, undefined); });
      this.lastRender = Date.now();
    }
  }
}

export class Handler {
  private readonly folders: IFolder[] = [];
  private readonly reg: abaplint.IRegistry;
  private readonly connection: LServer.Connection;
  private readonly setup: Setup;
  private timeouts: {[index: string]: any} = {};

  public static async create(connection: LServer.Connection, params: LServer.InitializeParams) {
    const handler = new Handler(connection, params);
    await handler.readAndSetConfig();
    return handler;
  }

  private constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.connection = connection;

    this.setup = new Setup(connection);
    this.folders = this.setup.determineFolders(params.workspaceFolders);
  }

  private async readAndSetConfig() {
    const config = await this.setup.readConfig(this.folders);
    this.reg.setConfig(config);
    this.setup.dumpFolders(this.folders);
  }

  public validateDocument(textDocument: LServer.TextDocument) {
    if (textDocument.uri.match(/^git:/)) {
      return; // ignore git things, triggered by revert code
    }
// todo: this should verify that the document is within the global.files specified in abaplint.json
//       this.reg already knows the configuration at this point

    const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText());
    try {
      this.reg.updateFile(file);
    } catch {
      this.reg.addFile(file);
    }

    // set a timeout so everything is not parsed at every keyboard press
    clearTimeout(this.timeouts[textDocument.uri]);
    this.timeouts[textDocument.uri] = setTimeout(() => this.run.bind(this)(textDocument), 200);
  }

  private run(textDocument: LServer.TextDocument): void {
//    console.dir("start validation " + textDocument.uri);
    const diagnostics = new abaplint.LanguageServer(this.reg).diagnostics(textDocument);
    this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
    delete this.timeouts[textDocument.uri];
  }

  public async configChanged(documents: LServer.TextDocuments<TextDocument>) {
    await this.readAndSetConfig();
    for (const document of documents.all()) {
      this.validateDocument(document);
    }
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

  public onReferences(params: LServer.TextDocumentPositionParams): LServer.Location[] {
    return new abaplint.LanguageServer(this.reg).references(params);
  }

  public onDocumentFormatting(params: LServer.DocumentFormattingParams): LServer.TextEdit[] {
    // todo, temporary workaround, the options from params should also be passed to abaplint
    const edits = new abaplint.LanguageServer(this.reg).documentFormatting({textDocument: params.textDocument});
    return edits;
  }

  public onSemanticTokensRange(params: LServer.SemanticTokensRangeParams): LServer.SemanticTokens {
    const range = {
      textDocument: params.textDocument,
      start: params.range.start,
      end: params.range.end,
    };
    return new abaplint.LanguageServer(this.reg).semanticTokensRange(range);
  }

  public async loadAndParseAll(progress: WorkDoneProgressReporter) {
    progress.report(0, "Reading files");
    for (const folder of this.folders) {
//      const glob = folder.root === "/" ? folder.glob : `${folder.root}${folder.glob}`;
      const glob = folder.glob;
      const filenames = await FileOperations.loadFileNames(glob, false);
      for (const filename of filenames) {
//        console.log("read " + filename);
        const raw = await FileOperations.readFile(filename);
        const uri = filename;
        this.reg.addFile(new abaplint.MemoryFile(uri, raw));
      }
    }

    await this.addDependencies();

    progress.report(0, "Parsing files");
    await this.reg.parseAsync({progress: new Progress(progress)});
  }

  private async addDependencies() {
    const deps = this.reg.getConfig().get().dependencies;
    if (deps !== undefined) {
      for (const d of deps) {
        let files: abaplint.IFile[] = [];
        // try looking in the folder first
        if (d.folder && d.folder !== "" && this.folders[0] !== undefined) {
          const glob = d.folder + d.files;
          const filenames = await FileOperations.getProvider().glob(glob);
          for (const filename of filenames) {
            const raw = await FileOperations.readFile(filename);
            const uri = URI.file(filename).toString();
            files.push(new abaplint.MemoryFile(uri, raw));
          }
        }
        if (files.length === 0 && d.url !== undefined && d.url !== "") {
          files = await GitOperations.clone(d);
        }
        console.log(files.length + " files in dependencies found");
        this.reg.addDependencies(files);
      }
    }
  }

  public updateTooltip() {
    const tooltip = "ABAP version: " + this.reg.getConfig().getVersion() + "\n" +
      "abaplint: " + abaplint.Registry.abaplintVersion() + "\n" +
      "Objects: " + this.reg.getObjectCount();
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

  public onGetConfig() {
    const defaultConfigString = JSON.stringify(abaplint.Config.getDefault().get(), undefined, 2);
    this.connection.sendNotification("abaplint/config/default/response", defaultConfigString);
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