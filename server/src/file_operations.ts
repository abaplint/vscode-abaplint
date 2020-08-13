import {PathLike, Stats,exists} from "fs";
import {readFile,lstat,unlink,rmdir,readdir} from "fs/promises";
import * as path from "path";
import * as glob from "glob";
import {IFile, MemoryFile} from "@abaplint/core";
import {promisify} from "util";

interface FsProvider{
  readFile:(path:PathLike,options:{ encoding: BufferEncoding; flag?: string; } )=>Promise<string>
  exists:(path:PathLike)=>Promise<boolean>
  lstat:(path: PathLike)=> Promise<Stats>
  unlink:(path: PathLike)=> Promise<void>
  readdir:(path: PathLike)=> Promise<string[]>
  rmdir:(path: PathLike)=> Promise<void>
}

let provider:FsProvider = {
  readFile,
  exists:promisify(exists),
  lstat,
  unlink,
  rmdir,
  readdir,
};

export function registerProvider(newProvider:FsProvider){
  provider = newProvider;
}

export class FileOperations {

  public static async readFile(name: string): Promise<string> {
    return provider.readFile(name,{encoding: "utf-8"});
  }

  public static async deleteFolderRecursive(p: string) {
    if (await provider.exists(p)) {
      const files = await provider.readdir(p);
      for (const file of files) {
        const curPath = p + path.sep + file;
        const curStats = await provider.lstat(curPath);
        if (curStats.isDirectory()) {
          await this.deleteFolderRecursive(curPath);
        } else {
          await provider.unlink(curPath);
        }
      }
      await provider.rmdir(p);
    }
  }

  public static async loadFileNames(arg: string, error = true): Promise<string[]> {
    const files = glob.sync(arg, {nosort: true, nodir: true});
    if (files.length === 0 && error) {
      // eslint-disable-next-line no-throw-literal
      throw "Error: No files found";
    }
    return files;
  }

  public static async loadFiles(input: string[]): Promise<IFile[]> {
    const files: IFile[] = [];

    for (const filename of input) {

      const base = filename.split("/").reverse()[0];
      if (base.split(".").length <= 2) {
        continue; // not a abapGit file
      }

      // note that readFileSync is typically faster than async readFile,
      // https://medium.com/@adamhooper/node-synchronous-code-runs-faster-than-asynchronous-code-b0553d5cf54e
      const raw = await FileOperations.readFile(filename);
      files.push(new MemoryFile(filename, raw));
    }
    return files;
  }

}