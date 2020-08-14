import {sep} from "path";
import {IFile, MemoryFile} from "@abaplint/core";
import {getProvider} from "./fs_provider";

export class FileOperations {

  public static async readFile(name: string): Promise<string> {
    return getProvider().readFile(name);
  }

  public static async deleteFolderRecursive(p: string) {
    if (await getProvider().exists(p)) {
      const files = await getProvider().readdir(p);
      for (const file of files) {
        const curPath = p + sep + file;
        if (await getProvider().isDirectory(curPath)) {
          await this.deleteFolderRecursive(curPath);
        } else {
          await getProvider().unlink(curPath);
        }
      }
      await getProvider().rmdir(p);
    }
  }

  public static async loadFileNames(arg: string, error = true): Promise<string[]> {
    const files = await getProvider().glob(arg);
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