import {commands, ExtensionContext, TabInputTextDiff, TextEditor, Uri, window, TextDocumentContentProvider, Event, workspace} from "vscode";
import {BaseLanguageClient} from "vscode-languageclient";
import {ATLASCODEDIFF, CodeNormalizer, getAbapCodeNormalizer, integrationIsActive} from "./integrations";
const ABAPGITSCHEME = "abapgit.normalized";

class NormalizedProvider implements TextDocumentContentProvider {
  private readonly normalizer: CodeNormalizer;
  public constructor(client: BaseLanguageClient) {
    this.normalizer = getAbapCodeNormalizer(client);
  };
  public onDidChange?: Event<Uri> | undefined;
  public async provideTextDocumentContent(uri: Uri): Promise<string> {
    const origUri = uri.with(JSON.parse(uri.query));
    const raw = await workspace.fs.readFile(origUri);
    return this.normalizer.normalize(raw.toString(), origUri);
  }
}

const shouldActivate = (e: TextEditor | undefined) => {
  const curtab = window.tabGroups.activeTabGroup;
  const uri = e?.document.uri;
  const isdiff = curtab.activeTab?.input instanceof TabInputTextDiff;
  if (!(isdiff && uri)) {return false;}
  const relevant =
    uri.path.match(/\.abap$/) ||
    uri.scheme === ATLASCODEDIFF && uri.fragment.match(/\.abap$/);
  return relevant && !integrationIsActive(uri);
};

const activateNormalizer = (e: TextEditor | undefined) => {
  commands.executeCommand("setContext", "abaplint.IsNormalizerEnabled", shouldActivate(e));
};

const toggleUrlNormalizer = (u:Uri) => {
  if (u.scheme  === ABAPGITSCHEME) {return u.with(JSON.parse(u.query));};
  const query = JSON.stringify(u);
  return u.with({scheme:ABAPGITSCHEME, query});
};

const toggleNormalizer = () => {
  const curtab = window.tabGroups.activeTabGroup.activeTab;
  if (!(curtab?.input instanceof TabInputTextDiff)) {return;}
  const {original, modified} = curtab.input;
  return commands.executeCommand<void>("vscode.diff", toggleUrlNormalizer(original), toggleUrlNormalizer(modified), curtab.label);
};

export const registerNormalizer = (context:ExtensionContext, client: BaseLanguageClient) => {
  const onchg = window.onDidChangeActiveTextEditor(activateNormalizer);
  const normalize = commands.registerCommand("abaplint.togglediffNormalize", toggleNormalizer);
  const provider = workspace.registerTextDocumentContentProvider(ABAPGITSCHEME, new NormalizedProvider(client));
  context.subscriptions.push(onchg, normalize, provider);
};