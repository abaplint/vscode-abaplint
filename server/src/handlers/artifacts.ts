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
      list.push({name: o.getName()});
    }
    return list;
  }
}