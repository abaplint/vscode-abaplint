import * as childProcess from "child_process";
import * as path from "path";
import * as abaplint from "@abaplint/core";
import * as fs from "fs";
import * as os from "os";
import {FileOperations} from "./file_operations";

const toUnixPath = (path: string) => path.replace(/[\\/]+/g, "/").replace(/^([a-zA-Z]+:|\.\/)/, "");

export class GitOperations {

  public static async clone(dep: abaplint.IDependency): Promise<abaplint.IFile[]> {
    if (fs.read === undefined || dep.url === undefined || dep.url === "") {
      return []; // running in web
    }

    // workaround for FS Provider, git operation happens on server side
    const oldProvider = FileOperations.getProvider();
    FileOperations.setDefaultProvider();

    process.stderr.write("Clone: " + dep.url + "\n");
    let dir = fs.mkdtempSync(path.join(os.tmpdir(), "abaplint-"));
    let cloneRoot = dir;
    if (os.platform() === "win32") {
      // must be converted to posix for glob patterns like "/{foo,src}/**/*.*" to work
      dir = toUnixPath(dir);
      cloneRoot = dir;
    }

    try {
      cloneRoot = await FileOperations.getProvider().gitClone(dep.url, dir);
    } catch {
      childProcess.execSync("git clone --quiet --depth 1 " + dep.url + " .", {cwd: dir});
    }

    const names = await FileOperations.loadFileNames(cloneRoot + dep.files);
    const files = await FileOperations.loadFiles(names);
    await FileOperations.deleteFolderRecursive(dir);

    FileOperations.setProvider(oldProvider);

    return files;
  }

}