import * as abaplint from "@abaplint/core";
import {ArtifactInformation} from "../common_types";

export class Artifacts {
  private readonly reg: abaplint.IRegistry;

  public constructor(reg: abaplint.IRegistry) {
    this.reg = reg;
  }

  public list(): ArtifactInformation[] {
    const list: ArtifactInformation[] = [];
    for (const o of this.reg.getObjects()) {
      if (this.reg.isDependency(o)) {
        continue;
      }
      let mainFile = o.getXMLFile()?.getFilename() || "";
      const subFiles: {name: string, file: string}[] = [];
      if (o instanceof abaplint.ABAPObject) {
        mainFile = o.getMainABAPFile()?.getFilename() || "";
        if (o instanceof abaplint.Objects.Class) {
          if (o.getLocalsImpFile()) {
            subFiles.push({
              name: "locals implementation",
              file: o.getLocalsImpFile()!.getFilename(),
            });
          }
          if (o.getTestclassFile()) {
            subFiles.push({
              name: "locals tests",
              file: o.getTestclassFile()!.getFilename(),
            });
          }
        }
      }
      list.push({
        type: o.getType(),
        name: o.getName(),
        description: o.getDescription() || "",
        mainFile,
        subFiles: subFiles,
      });
    }
    return list;
  }
}