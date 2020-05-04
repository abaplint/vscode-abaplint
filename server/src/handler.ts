import * as fs from "fs";
import * as glob from "glob";
import * as LServer from "vscode-languageserver";
import * as abaplint from "@abaplint/core";
import {URI} from "vscode-uri";
import {Setup} from "./setup";
import {WorkDoneProgress} from "vscode-languageserver/lib/progress";
import {TextDocument} from "vscode-languageserver-textdocument";
import {FileOperations} from "./file_operations";
import * as childProcess from "child_process";
import * as os from "os";
import * as path from "path";

export interface IFolder {
  root: string;
  glob: string;
}

class Progress implements abaplint.IProgress {
  private readonly renderThrottle = 2000;
  private readonly progress: WorkDoneProgress;
  private total: number;
  private lastRender: number;
  private current: number;

  public constructor(progress: WorkDoneProgress) {
    this.progress = progress;
  }

  public set(total: number, _text: string): void {
    this.total = total;
    this.current = 0;
    this.lastRender = 0;
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
      await new Promise((resolve) => {setTimeout(resolve, 0); });
      this.lastRender = Date.now();
    }
  }
}

export class Handler {
  private folders: IFolder[] = [];
  private reg: abaplint.Registry;
  private connection: LServer.Connection;
  private setup: Setup;

  constructor(connection: LServer.Connection, params: LServer.InitializeParams) {
    this.reg = new abaplint.Registry();
    this.connection = connection;

    this.setup = new Setup(connection);
    this.folders = this.setup.determineFolders(params.workspaceFolders);
    this.readAndSetConfig();
  }

  private readAndSetConfig() {
    this.reg.setConfig(this.setup.readConfig(this.folders));
  }

  public validateDocument(textDocument: LServer.TextDocument) {
    if (textDocument.uri.match(/^git:/)) {
      return; // ignore git things, triggered by revert code
    }

    const file = new abaplint.MemoryFile(textDocument.uri, textDocument.getText());
    try {
      this.reg.updateFile(file);
    } catch {
      this.reg.addFile(file);
    }

    const diagnostics = new abaplint.LanguageServer(this.reg).diagnostics(textDocument);
    this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
  }

  public configChanged(documents: LServer.TextDocuments<TextDocument>) {
    this.readAndSetConfig();
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

  public onDocumentFormatting(params: LServer.DocumentFormattingParams): LServer.TextEdit[] {
    // todo, temporary workaround, the options from params should also be passed to abaplint
    const edits = new abaplint.LanguageServer(this.reg).documentFormatting({textDocument: params.textDocument});
    return edits;
  }

  public async loadAndParseAll(progress: WorkDoneProgress) {
    progress.report(0, "Reading files");
    for (const folder of this.folders) {
      const filenames = glob.sync(folder.root + folder.glob, {nosort: true, nodir: true});
      for (const filename of filenames) {
        const raw = await fs.promises.readFile(filename, "utf-8");
        const uri = URI.file(filename).toString();
        this.reg.addFile(new abaplint.MemoryFile(uri, raw));
      }
    }

    await this.addDependencies(this.reg);

    progress.report(0, "Parsing files");
    await this.reg.parseAsync(new Progress(progress));
  }

  private async addDependencies(reg: abaplint.Registry) {
    const deps = this.reg.getConfig().get().dependencies;
    if (deps) {
      deps.forEach(function (dep) {
        (async () => {
          process.stderr.write("Clone: " + dep.url + "\n");
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abaplint-"));
          childProcess.execSync("git clone --quiet --depth 1 " + dep.url + " .", {cwd: dir, stdio: "inherit"});
          const names = FileOperations.loadFileNames(dir + dep.files);
          let files: abaplint.IFile[] = [];
          files = files.concat(await FileOperations.loadFiles(names));
          files.forEach(function (file) {
            reg.addFile(new abaplint.MemoryFile(file.getFilename(), file.getRaw()));
          });
          FileOperations.deleteFolderRecursive(dir);
        })();
      });
    }
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