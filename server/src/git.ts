import * as childProcess from "child_process";
import * as path from "path";
import * as abaplint from "@abaplint/core";
import * as fs from "fs";
import * as os from "os";
import {FileOperations} from "./file_operations";

export class GitOperations {

  public static async clone(dep: abaplint.IDependency): Promise<abaplint.IFile[]> {
    process.stderr.write("Clone: " + dep.url + "\n");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abaplint-"));
    childProcess.execSync("git clone --quiet --depth 1 " + dep.url + " .", {cwd: dir, stdio: "inherit"});
    const names = await FileOperations.loadFileNames(dir + dep.files);
    let files: abaplint.IFile[] = [];
    files = files.concat(await FileOperations.loadFiles(names));
    const ret: abaplint.IFile[] = [];
    files.forEach((file) => {
      ret.push(new abaplint.MemoryFile(file.getFilename(), file.getRaw()));
    });
    await FileOperations.deleteFolderRecursive(dir);
    return ret;
  }

}