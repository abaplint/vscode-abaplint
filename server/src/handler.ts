import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";
import {URI} from "vscode-uri";
import {Setup} from "./setup";
import {WorkDoneProgressReporter} from "vscode-languageserver/lib/common/progress";
import {TextDocument} from "vscode-languageserver-textdocument";
import {FileOperations} from "./file_operations";
import {GitOperations} from "./git";
import {UnitTests} from "./handlers/unit_test";
import {Formatting} from "./handlers/formatting";
import {ExtraSettings} from "./extra_settings";

export interface IFolder {
  root: string;
  scheme: string;
  authority: string;
  glob: string[];
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
  private readonly settings: ExtraSettings;
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
    this.folders = this.setup.determineFolders(params.workspaceFolders || []);
    this.settings = params.initializationOptions;
  }

  private async readAndSetConfig() {
    const config = await this.setup.readConfig(this.folders, this.settings);
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

  public onDumpStatementFlows(doc: {uri: string}) {
    let result = new abaplint.LanguageServer(this.reg).dumpStatementFlows(doc);
    if (result === "") {
      result = "empty";
    }
    this.connection.sendNotification("abaplint/dumpstatementflows/response", result);
  }

  public onDefinition(params: LServer.TextDocumentPositionParams): LServer.Location | undefined {
    return new abaplint.LanguageServer(this.reg).gotoDefinition(params);
  }

  public onReferences(params: LServer.TextDocumentPositionParams): LServer.Location[] | undefined {
    const server = new abaplint.LanguageServer(this.reg);
    const references = server.references(params);
    if (references.length === 0) {
      const doc = this.reg.getFileByName(params.textDocument.uri);
      const obj = doc && this.reg.findObjectForFile(doc);
      const diagnostic = obj && this.reg.findIssuesObject(obj)
        .find(d => d.getFilename() === params.textDocument.uri && d.getSeverity() === abaplint.Severity.Error);
      if (diagnostic) {
        this.connection.window.showErrorMessage("Reference search failed due to syntax errors");
      }
    }
    return references;
  }

  public async onDocumentFormatting(params: LServer.DocumentFormattingParams,
                                    experimentalFormatting: boolean,
                                    formattingDisabled: string[]): Promise<LServer.TextEdit[]> {
    if (experimentalFormatting === true) {
      return new Formatting(this.reg).findEdits(params.textDocument, formattingDisabled);
    } else {
      return new abaplint.LanguageServer(this.reg).documentFormatting({textDocument: params.textDocument});
    }
  }

  public onCodeLens(params: LServer.CodeLensParams): LServer.CodeLens[] {
    const lenses = new abaplint.LanguageServer(this.reg).codeLens(params.textDocument, this.settings.codeLens);
    return lenses;
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
      for (const glob of folder.glob) {
        const filenames = await FileOperations.loadFileNames(glob, false);
        for (const filename of filenames) {
          const raw = await FileOperations.readFile(filename);
          if (filename.includes(".smim.") && filename.endsWith(".xml") === false) {
            continue; // skip SMIM contents
          }
          const uri = filename;
          this.reg.addFile(new abaplint.MemoryFile(uri, raw));
        }
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
          console.log("Dependency glob: " + glob);
          const filenames = await FileOperations.getProvider().glob(glob);
          for (const filename of filenames) {
            if (filename.includes(".smim.") && filename.endsWith(".xml") === false) {
              continue; // skip SMIM contents
            }
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
    if (result === undefined) {
      return undefined;
    }
    const res = {range: result?.range, placeholder: result?.placeholder};
    return res;
  }

  public onRequestConfig() {
    const defaultConfigString = JSON.stringify(abaplint.Config.getDefault().get(), undefined, 2);
    this.connection.sendNotification("abaplint/config/default/response", defaultConfigString);
  }

  public onListUnitTests() {
    const tests = new UnitTests(this.reg).list();
    this.connection.sendNotification("abaplint/unittests/list/response", tests);
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

  public onInlayHint(params: LServer.InlayHintParams): LServer.InlayHint[] {
    try {
      return new abaplint.LanguageServer(this.reg).inlayHints(params.textDocument, this.settings.inlayHints);
    } catch (e) {
      console.log("Inlay error: " + e.message);
      return [];
    }
  }

}