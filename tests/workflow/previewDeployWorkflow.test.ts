import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(".github/workflows/preview-deploy.yml", "utf8");

describe("preview-deploy workflow", () => {
  test("keeps the preview deployment but runs smoke E2E against local Vite", () => {
    const yaml = workflow();

    expect(yaml).toContain("Deploy Vercel Preview");
    expect(yaml).toContain("Configure local Vite E2E");
    expect(yaml).toContain("Run local smoke E2E tests");
    expect(yaml).not.toContain("E2E_BASE_URL: ${{ steps.vercel.outputs.url }}");
    expect(yaml).not.toContain("PLAYWRIGHT_BYPASS_SECRET:");
  });

  test("does not overwrite an existing LINE_INTEGRATION_MODE", () => {
    const yaml = workflow();

    expect(yaml).toContain("node scripts/ensure-line-integration-mode.mjs");
    expect(yaml).not.toContain("pnpm exec convex env set LINE_INTEGRATION_MODE mock");
  });
});
