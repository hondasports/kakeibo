import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(".github/workflows/production-release.yml", "utf8");

describe("production-release workflow", () => {
  test("requires manual dispatch for an approved source ref", () => {
    const yaml = workflow();

    expect(yaml).toContain("workflow_dispatch:");
    expect(yaml).toContain("source_ref:");
    expect(yaml).toContain("preview_confirmed:");
    expect(yaml).toContain("db_schema_change_check:");
    expect(yaml).toContain("main|release/*");
  });

  test("guards production deployment with the GitHub production environment", () => {
    const yaml = workflow();

    expect(yaml).toContain("environment: production");
    expect(yaml).toContain("concurrency:");
    expect(yaml).toContain("group: production-release");
    expect(yaml).toContain("cancel-in-progress: false");
  });

  test("runs Vercel Preview smoke E2E before the production approval gate", () => {
    const yaml = workflow();
    const releaseCandidateIndex = yaml.indexOf("Vercel release candidate E2E");
    const productionIndex = yaml.indexOf("name: Deploy Production");

    expect(releaseCandidateIndex).toBeGreaterThan(-1);
    expect(productionIndex).toBeGreaterThan(releaseCandidateIndex);
    expect(yaml).toContain("environment: Preview");
    expect(yaml).toContain("E2E_BASE_URL: ${{ steps.vercel.outputs.url }}");
    expect(yaml).toContain(
      "PLAYWRIGHT_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}",
    );
    expect(yaml).toContain("needs: [release-candidate, preflight]");
  });

  test("deploys Convex production before Vercel production and records smoke results", () => {
    const yaml = workflow();
    const convexIndex = yaml.indexOf("Deploy Convex Production");
    const vercelIndex = yaml.indexOf("Deploy Vercel Production");
    const smokeIndex = yaml.indexOf("PROD smoke checklist");
    const summaryIndex = yaml.indexOf("Write release summary");

    expect(convexIndex).toBeGreaterThan(-1);
    expect(vercelIndex).toBeGreaterThan(convexIndex);
    expect(smokeIndex).toBeGreaterThan(vercelIndex);
    expect(summaryIndex).toBeGreaterThan(smokeIndex);
  });

  test("revalidates the production HTML and verifies the deployed title", () => {
    const yaml = workflow();

    expect(yaml).toContain('--header "Cache-Control: no-cache"');
    expect(yaml).toContain('expected_title="$(sed');
    expect(yaml).toContain('deployed_title="$(sed');
    expect(yaml).toContain('[ "$deployed_title" != "$expected_title" ]');
    expect(yaml).toContain("PROD_TITLE: ${{ steps.smoke.outputs.title }}");
    expect(yaml).toContain('echo "| PROD title | $PROD_TITLE |"');
    expect(yaml).not.toContain('echo "| PROD title | ${{ steps.smoke.outputs.title }} |"');
  });

  test("generates APP_VERSION from the Asia/Tokyo date and run number", () => {
    const yaml = workflow();

    expect(yaml).toContain("TZ=Asia/Tokyo");
    expect(yaml).toContain("GITHUB_RUN_NUMBER");
    expect(yaml).toContain("app_version=");
    expect(yaml).toContain("published_at=");
  });

  test("generates product updates in preflight before the production approval gate", () => {
    const yaml = workflow();
    const generateIndex = yaml.indexOf("Generate product updates");
    const productionIndex = yaml.indexOf("name: Deploy Production");
    const uploadIndex = yaml.indexOf("Upload product updates artifact");
    const downloadIndex = yaml.indexOf("Download product updates artifact");

    expect(generateIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeLessThan(productionIndex);
    expect(uploadIndex).toBeGreaterThan(generateIndex);
    expect(uploadIndex).toBeLessThan(productionIndex);
    expect(downloadIndex).toBeGreaterThan(productionIndex);
    expect(yaml).toContain("fetch-depth: 0");
    expect(yaml).toContain("pull-requests: read");
    expect(yaml).toContain("actions/upload-artifact@");
    expect(yaml).toContain("actions/download-artifact@");
  });

  test("creates a GitHub Release with a product-updates.json asset after smoke", () => {
    const yaml = workflow();
    const smokeIndex = yaml.indexOf("PROD smoke checklist");
    const releaseIndex = yaml.indexOf("Create GitHub Release");
    const summaryIndex = yaml.indexOf("Write release summary");

    expect(yaml).toContain("app-v");
    expect(yaml).toContain("product-updates.json");
    expect(yaml).toContain("#product-updates.json");
    expect(releaseIndex).toBeGreaterThan(smokeIndex);
    expect(summaryIndex).toBeGreaterThan(releaseIndex);
  });

  test("revalidates the deployed app version in PROD smoke", () => {
    const yaml = workflow();

    expect(yaml).toContain("app-version");
    expect(yaml).toContain("expected_app_version=");
    expect(yaml).toContain("deployed_app_version=");
    expect(yaml).toContain("PROD_APP_VERSION: ${{ steps.smoke.outputs.app_version }}");
  });

  test("grants contents write permission for GitHub releases", () => {
    const yaml = workflow();

    expect(yaml).toContain("contents: write");
  });

  test("does not depend on an OpenAI API key for product updates", () => {
    const yaml = workflow();
    const generator = readFileSync("scripts/generate-product-updates.ts", "utf8");

    expect(yaml).not.toContain("PRODUCT_UPDATE_OPENAI_API_KEY");
    expect(yaml).not.toContain("OPENAI_API_KEY");
    expect(generator).not.toContain("openai.com");
    expect(generator).not.toContain("OPENAI_API_KEY");
  });

  test("fails product update generation on errors instead of silently falling back", () => {
    const generator = readFileSync("scripts/generate-product-updates.ts", "utf8");

    expect(generator).not.toContain("Product update generation warning");
    expect(generator).not.toContain("skipped_no_api_key");
    expect(generator).toContain("SOURCE_REF をコミットSHAへ解決できません");
    expect(generator).toContain("pullRequestDecisions");
  });

  test("collects source pull requests from the commit range, not the merge PR body", () => {
    const generator = readFileSync("scripts/generate-product-updates.ts", "utf8");

    expect(generator).toContain("classifyCommitSubjects");
    expect(generator).toContain("collectPullRequestDecisions");
    expect(generator).toContain("filterUnpublishedPullRequests(records, pastUpdates)");
    expect(generator).toContain("fetchMergedPullsForCommit");
  });

  test("preserves release_note workflow input and RELEASE_NOTE for GitHub releases", () => {
    const yaml = workflow();

    expect(yaml).toContain("release_note:");
    expect(yaml).toContain("RELEASE_NOTE:");
    expect(yaml).toContain("--notes-file /tmp/release-notes.md");
  });
});
