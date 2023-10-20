import { EventEmitter, TextDocumentContentProvider, Uri, workspace } from "vscode"

export const ABAPLINTSCHEME = "ABAPLINT"

class DocProvider implements TextDocumentContentProvider {
  private static instance: DocProvider
  private emitter= new EventEmitter<Uri>;
  onDidChange = this.emitter.event
  documents = new Map<string,string>()
  async provideTextDocumentContent(uri: Uri) {
    if (uri.scheme !== ABAPLINTSCHEME)
      throw new Error(`Unexpected URI scheme ${uri.scheme}`)

    const contents = this.documents.get(uri.path)
    if(typeof contents!== "string")throw new Error(`Unknown document ${uri.toString()}`)
    return contents
  }
  setDocument(uri: Uri,contents: string){
    this.documents.set(uri.path,contents)
    this.emitter.fire(uri)
  }
  public static get(){
    if(!DocProvider.instance) DocProvider.instance= new DocProvider()
    return DocProvider.instance

  }
}

workspace.registerTextDocumentContentProvider(ABAPLINTSCHEME, DocProvider.get())

export const setDocument = (url: Uri,contents: string) => {
    DocProvider.get().setDocument(url,contents)
}
