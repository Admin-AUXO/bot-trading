import {
  countRecipeFilters,
  draftSchema,
  withAutoPackName,
  type DiscoveryLabPackDraft,
  type DiscoveryLabValidationIssue,
} from "../discovery-lab-pack-types.js";

export class StrategyPackDraftValidator {
  async validateDraft(
    input: DiscoveryLabPackDraft,
    allowOverfiltered = false,
  ): Promise<{
    ok: boolean;
    issues: DiscoveryLabValidationIssue[];
    pack: DiscoveryLabPackDraft;
  }> {
    let parsed: DiscoveryLabPackDraft;
    try {
      parsed = draftSchema.parse(withAutoPackName(input));
    } catch (err) {
      return {
        ok: false,
        issues: [{
          path: "draft",
          message: err instanceof Error ? err.message : "Invalid draft structure",
          level: "error",
        }],
        pack: input,
      };
    }

    const issues: DiscoveryLabValidationIssue[] = [];
    const recipeNames = new Set<string>();

    if ((parsed.defaultSources ?? []).length === 0) {
      issues.push({
        path: "defaultSources",
        message: "No sources selected; the run will default to pump_dot_fun.",
        level: "warning",
      });
    }

    for (let index = 0; index < parsed.recipes.length; index += 1) {
      const recipe = parsed.recipes[index];
      if (recipeNames.has(recipe.name)) {
        issues.push({
          path: `recipes.${index}.name`,
          message: "Recipe names must be unique within a pack.",
          level: "error",
        });
      }
      recipeNames.add(recipe.name);

      const filterCount = countRecipeFilters(recipe.params);
      if (filterCount > 5) {
        issues.push({
          path: `recipes.${index}.params`,
          message: allowOverfiltered
            ? `Recipe uses ${filterCount} provider-side filters; Birdeye may reject it.`
            : `Recipe uses ${filterCount} provider-side filters; Birdeye accepts at most 5.`,
          level: allowOverfiltered ? "warning" : "error",
        });
      } else if (filterCount === 5) {
        issues.push({
          path: `recipes.${index}.params`,
          message: "Recipe is at the 5-filter provider ceiling; adding another filter will break the request.",
          level: "warning",
        });
      }
    }

    return {
      ok: issues.every((issue) => issue.level !== "error"),
      issues,
      pack: parsed,
    };
  }
}
