import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
import {IFile, MemoryFile} from "@abaplint/core";

export class FileOperations {

  public static readFileSync(name: string): string {
    return fs.readFileSync(name, "utf-8");
  }

  public static async readFile(name: string): Promise<string> {
    return fs.promises.readFile(name, "utf-8");
  }

  public static deleteFolderRecursive(p: string) {
    if (fs.existsSync(p)) {
      const files = fs.readdirSync(p);
      for (const file of files) {
        const curPath = p + path.sep + file;
        if (fs.lstatSync(curPath).isDirectory()) {
          this.deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      }
      fs.rmdirSync(p);
    }
  }

  public static loadFileNames(arg: string, error = true): string[] {
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
      const raw = fs.readFileSync(filename, "utf8");
      files.push(new MemoryFile(filename, raw));
    }
    return files;
  }

}