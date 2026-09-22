import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(".github/workflows/e2e.yml", "utf8");

describe("e2e workflow", () => {
  test("runs for same-repository pull request creation and updates", () => {
    const yaml = workflow();

    expect(yaml).toContain("pull_request:");
    expect(yaml).toContain("- opened");
    expect(yaml).toContain("- synchronize");
    expect(yaml).toContain("- reopened");
    expect(yaml).toContain("- ready_for_review");
    expect(yaml).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(yaml).toContain("github.actor != 'dependabot[bot]'");
    expect(yaml).toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(yaml).toContain(
      "group: e2e-${{ matrix.name }}-${{ matrix.name == 'authenticated' && 'shared-dev' || github.event.pull_request.number }}",
    );
    expect(yaml).not.toContain("deployment_status:");
  });

  test("runs pull request smoke tests against the local Vite server", () => {
    const yaml = workflow();

    expect(yaml).toContain("Configure local Vite E2E");
    expect(yaml).toContain("VITE_CONVEX_URL: ${{ secrets.VITE_CONVEX_URL }}");
    expect(yaml).toContain("VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}");
    expect(yaml).toContain("node scripts/ensure-line-integration-mode.mjs");
    expect(yaml).not.toContain("pnpm exec convex env set LINE_INTEGRATION_MODE mock");
    expect(yaml).toContain("::error::DEV_CONVEX_DEPLOY_KEY is not set.");
    expect(yaml).not.toContain("Skipping Convex env sync");
    expect(yaml).not.toContain("E2E_BASE_URL: ${{ github.event.deployment_status.target_url }}");
    expect(yaml).not.toContain("PLAYWRIGHT_BYPASS_SECRET:");
  });
});
