import {sep} from "path";
import {IFile, MemoryFile} from "@abaplint/core";
import {exists, promises} from "fs";
import {promisify} from "util";
import {sync} from "glob";

export interface FsProvider {
  readFile: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  isDirectory: (path: string) => Promise<boolean>
  unlink: (path: string) => Promise<void>
  readdir: (path: string) => Promise<string[]>
  rmdir: (path: string) => Promise<void>
  glob: (pattern: string) => Promise<string[]>
}

class DefaultProvider implements FsProvider {
  public readFile(path: string) {
    return promises.readFile(path, {encoding:"utf-8"});
  }

  public exists(path: string) {
    return promisify(exists)(path);
  }

  public isDirectory(path: string) {
    return promises.lstat(path).then(s => s.isDirectory());
  }

  public unlink(path: string) {
    return promises.unlink(path);
  }

  public rmdir(path: string) {
    return promises.rmdir(path);
  }

  public readdir(path: string) {
    return promises.readdir(path);
  }

  public async glob(pattern: string) {
    const found = sync(pattern, {nosort: true, nodir: true});
    return found;
  }
}

let provider: FsProvider = new DefaultProvider();

export class FileOperations {

  public static setProvider(p: FsProvider): void {
    provider = p;
  }

  public static setDefaultProvider() {
    provider = new DefaultProvider();
  }

  public static getProvider(): FsProvider {
    return provider;
  }

  public static async readFile(name: string): Promise<string> {
    return provider.readFile(name);
  }

  public static async deleteFolderRecursive(p: string) {
    if (await provider.exists(p)) {
      const files = await provider.readdir(p);
      for (const file of files) {
        const curPath = p + sep + file;
        if (await provider.isDirectory(curPath)) {
          await this.deleteFolderRecursive(curPath);
        } else {
          await provider.unlink(curPath);
        }
      }
      await provider.rmdir(p);
    }
  }

  public static async loadFileNames(arg: string, error = true): Promise<string[]> {
    const files = await provider.glob(arg);
    if (files.length === 0 && error) {
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