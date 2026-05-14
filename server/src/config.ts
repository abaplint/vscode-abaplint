import * as abaplint from "@abaplint/core";

export function disableErrorOnDuplicateFilenames(config: abaplint.Config): abaplint.Config {
  config.get().global.errorOnDuplicateFilenames = false;
  return config;
}
