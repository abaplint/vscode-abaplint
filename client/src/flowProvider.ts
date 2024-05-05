import {EventEmitter, TextDocumentContentProvider, Uri, workspace} from "vscode";

export const ABAPLINTSCHEME = "ABAPLINT";

class DocProvider implements TextDocumentContentProvider {
  private static instance: DocProvider;
  private readonly emitter = new EventEmitter<Uri>();
  public onDidChange = this.emitter.event;
  private readonly documents = new Map<string, string>();
  public async provideTextDocumentContent(uri: Uri) {
    if (uri.scheme !== ABAPLINTSCHEME) {
      throw new Error(`Unexpected URI scheme ${uri.scheme}`);
    }

    const contents = this.documents.get(uri.path);
    return contents || "#no content found";
  }
  public setDocument(uri: Uri, contents: string) {
    if (contents) {
      this.documents.set(uri.path, contents);
      this.emitter.fire(uri);
    } else {this.documents.delete(uri.path);}
  }
  public static get() {
    if (!DocProvider.instance) {
      DocProvider.instance = new DocProvider();
    }
    return DocProvider.instance;
  }
}

workspace.registerTextDocumentContentProvider(ABAPLINTSCHEME, DocProvider.get());

export const setDocument = (url: Uri, contents: string) => {
  DocProvider.get().setDocument(url, contents);
};

workspace.onDidCloseTextDocument((doc) => {
  if (doc.uri.scheme === ABAPLINTSCHEME) {
    DocProvider.get().setDocument(doc.uri, "");
  }
});
