import * as abaplint from "@abaplint/core";

export class Artifacts {
  private readonly reg: abaplint.IRegistry;

  public constructor(reg: abaplint.IRegistry) {
    this.reg = reg;
  }

  public list() {
    const list: any = [];
    for (const o of this.reg.getObjects()) {
      list.push(o.getName());
    }
    return list;
  }
}