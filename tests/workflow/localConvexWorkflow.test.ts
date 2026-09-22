import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { isLocalConvexEnvironment } from "../../scripts/sync-e2e-env.mjs";

const readPackageJson = () =>
  JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

const readDocument = (path: string) => readFileSync(path, "utf8");

describe("local Convex development workflow", () => {
  test("starts the local Convex watcher and frontend together for default development", () => {
    const { scripts } = readPackageJson();
    const playwrightConfig = readDocument("playwright.config.ts");

    expect(scripts.dev).toBe('node scripts/start-local-convex.mjs --start "pnpm run dev:frontend"');
    expect(scripts["dev:frontend"]).toBe("vite");
    expect(playwrightConfig).toContain(
      'command: process.env.CI ? "pnpm run dev:frontend" : "pnpm run dev"',
    );
  });

  test("selects the local deployment before starting the default Convex watcher", () => {
    const { scripts } = readPackageJson();
    const launcher = readDocument("scripts/start-local-convex.mjs");

    expect(scripts["convex:dev"]).toBe("node scripts/start-local-convex.mjs");
    expect(launcher).toContain('["deployment", "select", "local"]');
    expect(launcher).toContain('["deployment", "create", "local", "--select"]');
    expect(launcher).toContain('[convexBin, "dev", ...process.argv.slice(2)]');
    expect(scripts["e2e:env-sync:cloud"]).toBe("node scripts/sync-e2e-env.mjs --allow-cloud");
  });

  test("requires an explicit command to start the cloud development deployment", () => {
    const { scripts } = readPackageJson();

    expect(scripts["convex:dev:cloud"]).toBe(
      "pnpm exec convex deployment select dev && pnpm exec convex dev",
    );
  });

  test("documents the roles of local, mocked, and cloud Convex environments", () => {
    const readme = readDocument("README.md");
    const environmentVariables = readDocument("docs/environment-variables.md");
    const serviceTooling = readDocument("docs/service-tooling-setup.md");

    expect(readme).toContain("`convex-test`");
    expect(readme).toContain("pnpm run dev");
    expect(readme).toContain("pnpm run convex:dev:cloud");
    expect(readme).toContain("Webhook");
    expect(environmentVariables).toContain("| Local                  | local deployment");
    expect(serviceTooling).toContain("`pnpm run dev` はlocal Convex watcherとViteを同時に起動する");
    expect(serviceTooling).toContain(
      "| local dev  | local `.env.local`                   | Development instance `pk_test_*` | local deployment",
    );
  });

  test("keeps initial env copying separate from deployment writes", () => {
    const syncScript = readDocument("scripts/sync-e2e-env.mjs");
    const developmentProcess = readDocument("docs/development-process.md");

    expect(syncScript).toContain('includes("--copy-only")');
    expect(syncScript).toContain('includes("--allow-cloud")');
    expect(syncScript).toContain('startsWith("local:")');
    expect(syncScript).toContain('"[::1]"');
    expect(syncScript).toContain("isLocalConvexEnvironment");
    expect(syncScript).toContain("cloud Convex deploymentへのE2E環境変数反映を拒否しました");
    expect(syncScript).toContain('syncConvexEnv("CLERK_JWT_ISSUER_DOMAIN"');
    expect(syncScript).toContain("windowsExitAssertionAfterSuccess");
    expect(developmentProcess).toContain("pnpm run e2e:env-sync -- --copy-only");
    expect(developmentProcess).toContain("pnpm run e2e:env-sync");
    expect(developmentProcess).toContain("pnpm run e2e:env-sync:cloud");
  });

  test("recognizes the bracketed IPv6 loopback as a local Convex endpoint", () => {
    const env = new Map([
      ["CONVEX_DEPLOYMENT", "local:local-test"],
      ["VITE_CONVEX_URL", "http://127.0.0.1:3210"],
      ["VITE_CONVEX_SITE_URL", "http://[::1]:3211"],
    ]);

    expect(isLocalConvexEnvironment(env)).toBe(true);
  });
});
