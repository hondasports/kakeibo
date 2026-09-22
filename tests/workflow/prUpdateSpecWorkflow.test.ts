import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(".github/workflows/pr-update-spec.yml", "utf8");

describe("pr-update-spec workflow", () => {
  test("runs for preview-bound pull requests including body edits", () => {
    const yaml = workflow();

    expect(yaml).toContain("pull_request:");
    expect(yaml).toContain("- preview");
    expect(yaml).toContain("- opened");
    expect(yaml).toContain("- edited");
    expect(yaml).toContain("- synchronize");
    expect(yaml).toContain("- reopened");
  });

  test("runs for bot-authored pull requests too; the checker gates on the spec marker", () => {
    const yaml = workflow();
    const checker = readFileSync("scripts/check-pr-product-update.ts", "utf8");

    expect(yaml).not.toContain("github.event.pull_request.user.type");
    expect(checker).toContain("UPDATE_SPEC_START_MARKER");
  });

  test("validates the PR body with the shared spec module", () => {
    const yaml = workflow();
    const checker = readFileSync("scripts/check-pr-product-update.ts", "utf8");

    expect(yaml).toContain("scripts/check-pr-product-update.ts");
    expect(checker).toContain("readProductUpdateSpec");
    expect(checker).toContain("GITHUB_EVENT_PATH");
    expect(checker).toContain("GITHUB_STEP_SUMMARY");
  });
});
