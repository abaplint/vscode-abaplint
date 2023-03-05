import * as abaplint from "@abaplint/core";
import {UnitTestInformation} from "../common_types";

export class UnitTests {
  private readonly reg: abaplint.IRegistry;

  public constructor(reg: abaplint.IRegistry) {
    this.reg = reg;
  }

  public list() {
    const ret: UnitTestInformation[] = [];
    for (const obj of this.reg.getObjects()) {
      if (this.reg.isDependency(obj) || !(obj instanceof abaplint.Objects.Class)) {
        continue;
      }
      for (const file of obj.getABAPFiles()) {
        for (const def of file.getInfo().listClassDefinitions()) {
          if (def.isForTesting === false
              || def.isGlobal === true // todo, there might be global test methods
              || def.methods.length === 0) {
            continue;
          }
          for (const m of def.methods) {
            if (m.isForTesting === false) {
              continue;
            }
            const upper = m.name.toUpperCase();
            if (upper === "SETUP"
                || upper === "TEARDOWN"
                || upper === "CLASS_SETUP"
                || upper === "CLASS_TEARDOWN") {
              continue;
            }
            ret.push({
              global: obj.getName(),
              testClass: def.name,
              method: m.name,
              filename: file.getFilename(),
              start: m.identifier.getStart(),
            });
          }
        }
      }
    }
    return ret;
  }
}