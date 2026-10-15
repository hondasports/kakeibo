import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const workflow = () => readFileSync(".github/workflows/preview-deploy.yml", "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobs = (): Record<string, any> => parse(workflow()).jobs;

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
    const job = jobs()["local-e2e"];
    const text = JSON.stringify(job);

    expect(text).toContain(
      'node scripts/start-ci-convex.mjs --run \\"${{ matrix.e2e_command }}\\"',
    );
    expect(text).toContain("pnpm run e2e:public --project=chromium --workers=3");
    expect(text).toContain(
      "pnpm run e2e:smoke --project=chromium --grep-invert @public --workers=1",
    );
    expect(text).toContain("~/.cache/convex");
    expect(text).not.toContain("CONVEX_DEPLOY_KEY");
    expect(text).not.toContain("E2E_CLEANUP_SECRET");
    expect(job.environment).toBeUndefined();
  });

  test("keeps the isolated E2E out of the staging serialization groups", () => {
    const { "local-e2e": localE2e, preview, "wait-for-staging-window": wait } = jobs();

    expect(localE2e.needs).toBeUndefined();
    expect(localE2e.concurrency["cancel-in-progress"]).toBe(true);
    expect(localE2e.concurrency.group).toContain("preview-local-e2e");
    expect(localE2e.concurrency.group).not.toContain("preview-staging");
    expect(preview.needs).not.toContain("local-e2e");
    expect(wait.needs).toBeUndefined();
  });

  test("does not overwrite an existing LINE_INTEGRATION_MODE", () => {
    const yaml = workflow();

    expect(yaml).toContain("node scripts/ensure-line-integration-mode.mjs");
    expect(yaml).not.toContain("pnpm exec convex env set LINE_INTEGRATION_MODE mock");
  });
});
