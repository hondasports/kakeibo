import { describe, expect, it } from "vitest";

import { suggestSkillsForPaths } from "./suggest-skills.mjs";

function suggestedSkills(result) {
  return result.suggestions.map((s) => s.skill);
}

describe("suggestSkillsForPaths", () => {
  it("suggests convex-local-ops for convex changes", () => {
    const result = suggestSkillsForPaths(["convex/expenses.ts"]);
    expect(suggestedSkills(result)).toContain("convex-local-ops");
  });

  it("suggests e2e-spec-authoring for e2e spec changes", () => {
    const result = suggestSkillsForPaths(["e2e/group-access.spec.ts"]);
    expect(suggestedSkills(result)).toContain("e2e-spec-authoring");
    expect(result.runtimeRelevant).toBe(true);
  });

  it("suggests env and ops skills for .env and workflow changes", () => {
    const envResult = suggestSkillsForPaths(["docs/environment-variables.md", ".env.example"]);
    expect(suggestedSkills(envResult)).toEqual(
      expect.arrayContaining(["local-dev-env", "service-ops-safety", "security-review"]),
    );

    const workflowResult = suggestSkillsForPaths([".github/workflows/e2e.yml"]);
    expect(suggestedSkills(workflowResult)).toEqual(
      expect.arrayContaining(["security-review", "service-ops-safety"]),
    );
  });

  it("suggests receipt-tax-domain and line-integration for their domains", () => {
    expect(suggestedSkills(suggestSkillsForPaths(["convex/aiExpenseDrafts/index.ts"]))).toContain(
      "receipt-tax-domain",
    );
    expect(suggestedSkills(suggestSkillsForPaths(["convex/lineWebhook/actions.ts"]))).toContain(
      "line-integration",
    );
  });

  it("does not match auth inside unrelated words like authoring", () => {
    const result = suggestSkillsForPaths(["skills/e2e-spec-authoring/SKILL.md"]);
    expect(suggestedSkills(result)).not.toContain("security-review");
  });

  it("suggests security-review for real auth and webhook paths", () => {
    expect(suggestedSkills(suggestSkillsForPaths(["convex/users/auth.ts"]))).toContain(
      "security-review",
    );
    expect(suggestedSkills(suggestSkillsForPaths(["convex/lineWebhook/http.ts"]))).toContain(
      "security-review",
    );
  });

  it("suggests nothing for process-only changes and reports runtime_relevant false", () => {
    const result = suggestSkillsForPaths([
      "docs/development-process.md",
      "skills/code-review/SKILL.md",
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.runtimeRelevant).toBe(false);
  });

  it("suggests nothing extra for generic app code", () => {
    const result = suggestSkillsForPaths(["src/App.tsx"]);
    expect(result.suggestions).toEqual([]);
    expect(result.runtimeRelevant).toBe(true);
  });
});
