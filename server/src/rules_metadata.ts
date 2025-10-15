import {ArtifactsRules, RuleTag} from "@abaplint/core";

type IRuleMetadata = {
  key: string;
  tags: RuleTag[];
}

export class RulesMetadata {
  private static metadata: IRuleMetadata[] | undefined = undefined;

  public static get(): IRuleMetadata[] {
    if (this.metadata !== undefined) {
      return this.metadata;
    }

    const rules = ArtifactsRules.getRules();

    this.metadata = rules.map((r) => {
      return {
        key: r.getMetadata().key,
        tags: r.getMetadata().tags || [],
      };
    });

    return this.metadata;
  }
}