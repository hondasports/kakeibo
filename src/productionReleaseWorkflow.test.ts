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
    expect(yaml).toContain("needs: release-candidate");
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
    expect(yaml).toContain("APP_VERSION=");
    expect(yaml).toContain("PUBLISHED_AT=");
  });

  test("injects VITE_APP_VERSION and generates product updates before the build", () => {
    const yaml = workflow();
    const generateIndex = yaml.indexOf("Generate product updates");
    const convexIndex = yaml.indexOf("Deploy Convex Production");

    expect(yaml).toContain("VITE_APP_VERSION");
    expect(generateIndex).toBeGreaterThan(-1);
    expect(convexIndex).toBeGreaterThan(generateIndex);
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

  test("exposes OPENAI_API_KEY and BASE_REF to the generate product updates step", () => {
    const yaml = workflow();

    expect(yaml).toContain("OPENAI_API_KEY: ${{ secrets.PRODUCT_UPDATE_OPENAI_API_KEY }}");
    expect(yaml).toContain("BASE_REF");
    expect(yaml).not.toContain("OPENAI_API_KEY: ${{ secrets.RELEASE_NOTE }}");
  });

  test("records product update generation warnings without blocking deployment", () => {
    const yaml = workflow();
    const generator = readFileSync("scripts/generate-product-updates.ts", "utf8");

    expect(generator).toContain("Product update generation warning");
    expect(generator).toContain("automatic product updates were not added");
    expect(generator).toContain(
      "...(sourceRef && processedSourceAt ? { sourceRef, sourceMergedAt: processedSourceAt } : {}),",
    );
    expect(generator).not.toContain("...(sourceRef ? { sourceRef } : {}),");
    expect(yaml).toContain("Generate product updates");
    expect(yaml).toContain("Deploy Vercel Production");
  });

  test("filters previously published PRs before generating product updates", () => {
    const generator = readFileSync("scripts/generate-product-updates.ts", "utf8");

    expect(generator).toContain("filterUnpublishedPullRequests");
    expect(generator).toContain("filterUnpublishedPullRequests(fetchedPulls, pastUpdates)");
  });

  test("preserves release_note workflow input and RELEASE_NOTE for GitHub releases", () => {
    const yaml = workflow();

    expect(yaml).toContain("release_note:");
    expect(yaml).toContain("RELEASE_NOTE:");
    expect(yaml).toContain("--notes-file /tmp/release-notes.md");
  });
});
