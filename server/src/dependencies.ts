import {URI} from "vscode-uri";
import {GitOperations} from "./git";
import * as abaplint from "@abaplint/core";
import {FileOperations} from "./file_operations";
import {IFolder} from "./types";
import * as fs from "fs";

export class Dependencies {
  private readonly reg: abaplint.IRegistry;
  private readonly folders: IFolder[];

  public constructor(reg: abaplint.IRegistry, folders: IFolder[]) {
    this.reg = reg;
    this.folders = folders;
  }

  public activateFallback(): boolean {
    if (fs.read !== undefined) {
      return false; // not running in web
    }

    // cannot do "git clone" in web, so only activate fallback if at least one dependency has a url

    const deps = this.reg.getConfig().get().dependencies;
    if (deps !== undefined && deps.length > 0) {
      for (const d of deps) {
        if (d.url !== undefined && d.url !== "") {
          return true;
        }
      }
    }

    return false;
  }

  public async addToRegistry() {
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


}