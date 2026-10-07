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
    expect(yaml).toContain("group: e2e-${{ matrix.name }}-${{ github.event.pull_request.number }}");
    expect(yaml).toContain("cancel-in-progress: true");
    expect(yaml).not.toContain("shared-dev");
    expect(yaml).not.toContain("github.event.pull_request.draft");
    expect(yaml).not.toContain("deployment_status:");
  });

  test("runs E2E against a PR-scoped anonymous disposable Convex backend", () => {
    const yaml = workflow();

    expect(yaml).toContain('node scripts/start-ci-convex.mjs --run "${{ matrix.e2e_command }}"');
    expect(yaml).toContain("CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}");
    expect(yaml).toContain("CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}");
    expect(yaml).toContain("E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}");
    expect(yaml).toContain("path: ~/.cache/convex");
    expect(yaml).not.toContain("secrets.DEV_");
    expect(yaml).not.toContain("secrets.VITE_CONVEX_URL");
    expect(yaml).not.toContain("Configure local Vite E2E");
    expect(yaml).not.toContain("Sync E2E cleanup secret");
    expect(yaml).not.toContain("::error::DEV_CONVEX_DEPLOY_KEY is not set.");
    expect(yaml).not.toContain("E2E_BASE_URL: ${{ github.event.deployment_status.target_url }}");
    expect(yaml).not.toContain("PLAYWRIGHT_BYPASS_SECRET:");
  });
});
