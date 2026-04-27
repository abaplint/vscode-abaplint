import * as path from "path";
import * as abaplint from "@abaplint/core";
import * as fs from "fs";
import * as os from "os";
import {FileOperations} from "./file_operations";

const toUnixPath = (path: string) => path.replace(/[\\/]+/g, "/").replace(/^([a-zA-Z]+:|\.\/)/, "");
const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export class GitOperations {

  public static async clone(dep: abaplint.IDependency): Promise<abaplint.IFile[]> {
    if (fs.read === undefined || dep.url === undefined || dep.url === "") {
      return []; // running in web
    }

    let dir = fs.mkdtempSync(path.join(os.tmpdir(), "abaplint-"));
    if (os.platform() === "win32") {
      // must be converted to posix for glob patterns like "/{foo,src}/**/*.*" to work
      dir = toUnixPath(dir);
    }
    process.stderr.write("Clone: " + dep.url + " to " + dir + "\n");

    const oldProvider = FileOperations.getProvider();
    let cloneRoot = dir;
    try {
      const result = await oldProvider.gitClone(dep.url, dir);
      if (result && result.length > 0) {
        cloneRoot = result;
      }
      if (os.platform() === "win32") {
        cloneRoot = toUnixPath(cloneRoot);
      }

      // Cloned dependency files are outside the workspace, so use local fs/glob.
      FileOperations.setDefaultProvider();
      const names = await FileOperations.loadFileNames(cloneRoot + dep.files);
      return await FileOperations.loadFiles(names);
    } catch (error) {
      process.stderr.write("Dependency clone/load failed: " + toErrorMessage(error) + "\n");
      return [];
    } finally {
      FileOperations.setDefaultProvider();
      await FileOperations.deleteFolderRecursive(dir);
      FileOperations.setProvider(oldProvider);
    }
  }

}