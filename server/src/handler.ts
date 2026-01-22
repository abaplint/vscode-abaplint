/* eslint-disable max-len */
import {AbaplintConfigLens} from "./abaplint_config_lens";
import {ExtraSettings} from "./extra_settings";
import {Formatting} from "./handlers/formatting";
import {RulesMetadata} from "./rules_metadata";
import {Setup} from "./setup";
import {TextDocument} from "vscode-languageserver-textdocument";
import {UnitTests} from "./handlers/unit_test";
import {WorkDoneProgressReporter} from "vscode-languageserver/lib/common/progress";
import * as abaplint from "@abaplint/core";
import * as LServer from "vscode-languageserver";
import {FileOperations} from "./file_operations";
import {Dependencies} from "./dependencies";
import {IFolder} from "./types";
import {isRemoteFilesystem} from "./utils";
import {URI} from "vscode-uri";

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
  private fallbackActivated: boolean = false;
  private timeouts: {[index: string]: any} = {};
  private configPath?: string;

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
    const result = await this.setup.readConfig(this.folders, this.settings);
    this.reg.setConfig(result.config);
    this.configPath = result.configPath;
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
    this.timeouts[textDocument.uri] = setTimeout(() => this.runDiagnostics.bind(this)(textDocument), 200);
  }

  private runDiagnostics(textDocument: LServer.TextDocument): void {
//    console.dir("start validation " + textDocument.uri);
    const diagnostics = new abaplint.LanguageServer(this.reg).diagnostics(textDocument);
    this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
    delete this.timeouts[textDocument.uri];
  }

  public async configChanged(documents: LServer.TextDocuments<TextDocument>, localConfigPath?: string) {
    // Update settings with the new localConfigPath if provided
    if (localConfigPath !== undefined) {
      this.settings.localConfigPath = localConfigPath;
    }

    await this.readAndSetConfig();
    this.connection.console.log("Config reloaded, new configPath: " + (this.configPath || "undefined"));

    // Notify client that config has been reloaded so help page can refresh
    this.connection.sendNotification("abaplint/config/reloaded", {
      configPath: this.configPath,
    });

    for (const document of documents.all()) {
      this.validateDocument(document);
    }
  }

  public onHelp(uri: string, position: LServer.Position) {
    try {
      let help = new abaplint.LanguageServer(this.reg).help({uri: uri}, position);

      // Debug logging
      this.connection.console.log("onHelp called, configPath: " + (this.configPath || "undefined"));

      // Prepend config file information to help content
      if (this.configPath) {
        try {
          // Create proper file URI for local files
          let fileUri: string;
          if (this.configPath.startsWith("/") || this.configPath.match(/^[a-zA-Z]:\\/)) {
            // Local file path - convert to file:// URI
            fileUri = `file://${this.configPath.startsWith("/") ? "" : "/"}${this.configPath}`;
          } else {
            // Already a URI (e.g., abap://, file://)
            fileUri = this.configPath;
          }

          // Escape HTML special characters in the path for display
          const escapedPath = this.configPath
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

          // VS Code command URIs need arguments as an array
          const encodedUri = encodeURIComponent(JSON.stringify([fileUri]));
          const commandUri = `command:vscode.open?${encodedUri}`;
          const loadDifferentConfigUri = `command:abaplint.load.different.config`;
          const configInfo = `<div style="background-color: var(--vscode-editor-background, #f0f0f0); padding: 10px; margin-bottom: 10px; border-radius: 5px; border: 1px solid var(--vscode-panel-border, #e0e0e0);">
            <strong>Configuration File:</strong>
            <a href="${commandUri}" style="text-decoration: none; color: var(--vscode-textLink-foreground, #0066cc);">
              ${escapedPath}
            </a>
            <div style="margin-top: 8px;">
              <a href="${loadDifferentConfigUri}" style="display: inline-block; padding: 6px 12px; background-color: var(--vscode-button-background, #0066cc); color: var(--vscode-button-foreground, white); text-decoration: none; border-radius: 3px; font-size: 13px;">
                Load Config
              </a>
            </div>
          </div>`;
          help = configInfo + help;
        } catch (error) {
          this.connection.console.error("Error formatting config info: " + error);
          // Continue with help content even if config info formatting fails
        }
      } else {
        const loadDifferentConfigUri = `command:abaplint.load.different.config`;
        const configInfo = `<div style="background-color: var(--vscode-inputValidation-warningBackground, #fff3cd); padding: 10px; margin-bottom: 10px; border-radius: 5px; border: 1px solid var(--vscode-inputValidation-warningBorder, #f0ad4e);">
          <strong>Configuration:</strong> Using default configuration (no abaplint.json found)
          <div style="margin-top: 8px;">
            <a href="${loadDifferentConfigUri}" style="display: inline-block; padding: 6px 12px; background-color: var(--vscode-button-background, #0066cc); color: var(--vscode-button-foreground, white); text-decoration: none; border-radius: 3px; font-size: 13px;">
              Load Config File
            </a>
          </div>
        </div>`;
        help = configInfo + help;
      }

      this.connection.sendNotification("abaplint/help/response", help);
    } catch (error) {
      this.connection.console.error("Error in onHelp: " + error);
      // Send basic help response on error
      this.connection.sendNotification("abaplint/help/response", "Error loading help content");
    }
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

  public onCodeLens(params: LServer.CodeLensParams, documents: LServer.TextDocuments<LServer.TextDocument>): LServer.CodeLens[] {
    if (params.textDocument.uri.endsWith("abaplint.json") || params.textDocument.uri.endsWith("abaplint.jsonc")) {
      return AbaplintConfigLens.getCodeLenses(params.textDocument, documents, this.fallbackActivated);
    } else {
      const lenses = new abaplint.LanguageServer(this.reg).codeLens(params.textDocument, this.settings.codeLens);
      return lenses;
    }
  }

  public onSemanticTokensRange(params: LServer.SemanticTokensRangeParams): LServer.SemanticTokens {
    const range = {
      textDocument: params.textDocument,
      start: params.range.start,
      end: params.range.end,
    };
    return new abaplint.LanguageServer(this.reg).semanticTokensRange(range);
  }

  /** it cannot be disalbed again, only by restarting */
  private async activateFallback() {
    this.fallbackActivated = true;

    const newConfig = this.reg.getConfig().get();
    const nonSingleFileRule = RulesMetadata.getNonSingleFile().map(r => r.key);

    for (const rule in newConfig.rules) {
      if (newConfig.rules[rule] === undefined || newConfig.rules[rule] === false) {
        continue;
      }

      if (nonSingleFileRule.includes(rule)) {
        newConfig.rules[rule] = false;
      }
    }

    this.reg.setConfig(new abaplint.Config(JSON.stringify(newConfig)));

    // todo: disable inlay hints and code lens, maybe it works, test it!
  }

  public async loadAndParseAll(progress: WorkDoneProgressReporter, fallbackThreshold: number) {
    progress.report(0, "Reading files");
    for (const folder of this.folders) {
      if (isRemoteFilesystem(folder.scheme)) {
        await this.activateFallback();
        return;
      }

      const filenames: string[] = [];
      for (const glob of folder.glob) {
        filenames.push(...await FileOperations.loadFileNames(glob, false));
      }

      if (filenames.length > fallbackThreshold) {
        await this.activateFallback();
        return;
      }

      for (const filename of filenames) {
        if (filename.includes(".smim.") && filename.endsWith(".xml") === false) {
          continue; // skip SMIM contents
        }
        const raw = await FileOperations.readFile(filename);
        this.reg.addFile(new abaplint.MemoryFile(filename, raw));
      }
    }

    const dependencies = new Dependencies(this.reg, this.folders);
    if (dependencies.activateFallback() === true) {
      await this.activateFallback();
    } else {
      await dependencies.addToRegistry();
    }

    progress.report(0, "Parsing files");
    await this.reg.parseAsync({progress: new Progress(progress)});
  }

  public updateTooltip() {
    const tooltip = "ABAP version: " + this.reg.getConfig().getVersion() + "\n" +
      "abaplint: " + abaplint.Registry.abaplintVersion() + "\n" +
      "Fallback threshold: " + this.settings.fallbackThreshold + "\n" +
      "Fallback activated: " + this.fallbackActivated + "\n" +
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
    if (this.settings.outline?.disableForRemoteFilesystems !== false) {
      const parsed = URI.parse(params.textDocument.uri);
      if (isRemoteFilesystem(parsed.scheme)) {
        return [];
      }
    }
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
