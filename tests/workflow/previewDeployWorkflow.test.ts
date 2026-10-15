import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(".github/workflows/preview-deploy.yml", "utf8");

describe("preview-deploy workflow", () => {
  test("keeps the preview deployment but runs only @staging E2E against staging Convex", () => {
    const yaml = workflow();

    expect(yaml).toContain("Deploy Vercel Preview");
    expect(yaml).toContain("Configure local Vite E2E");
    expect(yaml).toContain("Run staging integration smoke E2E tests");
    expect(yaml).toContain("run: pnpm run e2e:staging -- --project=chromium");
    expect(yaml).not.toContain("run: pnpm run e2e:smoke -- --project=chromium");
    expect(yaml).not.toContain("E2E_BASE_URL: ${{ steps.vercel.outputs.url }}");
    expect(yaml).not.toContain("PLAYWRIGHT_BYPASS_SECRET:");
  });

  test("runs the full @public / @smoke E2E on an isolated backend, not on staging", () => {
    const yaml = workflow();
    const localE2eJob = yaml.slice(yaml.indexOf("  local-e2e:"), yaml.indexOf("  preview:"));

    expect(localE2eJob).toContain(
      'node scripts/start-ci-convex.mjs --run "${{ matrix.e2e_command }}"',
    );
    expect(localE2eJob).toContain("pnpm run e2e:public --project=chromium --workers=3");
    expect(localE2eJob).toContain(
      "pnpm run e2e:smoke --project=chromium --grep-invert @public --workers=1",
    );
    expect(localE2eJob).toContain("path: ~/.cache/convex");
    expect(localE2eJob).not.toContain("CONVEX_DEPLOY_KEY");
    expect(localE2eJob).not.toContain("E2E_CLEANUP_SECRET");
    expect(localE2eJob).not.toContain("environment:");
    expect(localE2eJob).not.toContain("needs:");
  });

  test("does not make the staging deployment wait for the isolated E2E", () => {
    const yaml = workflow();
    const previewJob = yaml.slice(yaml.indexOf("  preview:"));

    expect(previewJob).not.toContain("needs:");
  });

  test("does not overwrite an existing LINE_INTEGRATION_MODE", () => {
    const yaml = workflow();

    expect(yaml).toContain("node scripts/ensure-line-integration-mode.mjs");
    expect(yaml).not.toContain("pnpm exec convex env set LINE_INTEGRATION_MODE mock");
  });
});
