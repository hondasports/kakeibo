import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { CLOUD_SELECTORS, selectedDeployment } from "../helpers/ci-convex-test-fixtures.mjs";
import {
  backendEnv,
  buildChildEnv,
  createLocalDeploymentConfig,
  generateCleanupSecret,
  redact,
  runConvexCli,
} from "./ci-convex-env-boundary.mjs";
import { startBackend } from "./ci-convex-backend.mjs";

describe("local-only CLI boundary", () => {
  it("rejects invalid ports before spawning a deployment-capable CLI", () => {
    const spawnImpl = vi.fn();
    expect(() =>
      startBackend({ E2E_CONVEX_CLOUD_PORT: "0" }, { envFile: "dummy.env", spawnImpl }),
    ).toThrow("E2E_CONVEX_CLOUD_PORT");
    expect(spawnImpl).not.toHaveBeenCalled();
  });
  it.each([
    [{}, "3210", "3211"],
    [
      { E2E_VITE_PORT: "15173", E2E_CONVEX_CLOUD_PORT: "13210", E2E_CONVEX_SITE_PORT: "13211" },
      "13210",
      "13211",
    ],
  ])("passes the selected local backend ports to Convex", (base, cloud, site) => {
    const config = createLocalDeploymentConfig();
    const spawnImpl = vi.fn(() => ({ stdout: { on() {} }, stderr: { on() {} } }));
    try {
      startBackend(backendEnv(base), { envFile: config.envFile, spawnImpl });
      const args = spawnImpl.mock.calls[0][1];
      expect(
        args.slice(args.indexOf("--local-cloud-port"), args.indexOf("--local-cloud-port") + 2),
      ).toEqual(["--local-cloud-port", cloud]);
      expect(
        args.slice(args.indexOf("--local-site-port"), args.indexOf("--local-site-port") + 2),
      ).toEqual(["--local-site-port", site]);
      expect(selectedDeployment(os.tmpdir(), args, backendEnv(base)).kind).toBe("anonymous");
    } finally {
      config.cleanup();
    }
  });

  for (const source of [".env", ".env.local", "inherited"]) {
    it.each(CLOUD_SELECTORS)(
      `ignores ${source} %s before the first push and during env writes`,
      (_name, selectors) => {
        const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-selection-"));
        const config = createLocalDeploymentConfig({ tempRoot: dir });
        try {
          const { envFile } = config;
          const content = Object.entries(selectors)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");
          if (source !== "inherited") {
            writeFileSync(path.join(dir, source), content);
          }
          const env = backendEnv(source === "inherited" ? selectors : {});
          const selections = [];
          const spawnImpl = vi.fn((_bin, args, options) => {
            selections.push(selectedDeployment(dir, args, options.env));
            return { stdout: { on() {} }, stderr: { on() {} } };
          });
          const spawnSyncImpl = vi.fn((_bin, args, options) => {
            selections.push(selectedDeployment(dir, args, options.env));
            return { status: 0, stdout: "", stderr: "" };
          });
          startBackend(env, { envFile, spawnImpl });
          runConvexCli(["env", "set", "APP_ENV", "development"], env, { envFile, spawnSyncImpl });
          expect(selections).toEqual([
            { kind: "anonymous", deploymentName: "anonymous-agent" },
            { kind: "anonymous", deploymentName: "anonymous-agent" },
          ]);
          if (source !== "inherited")
            expect(readFileSync(path.join(dir, source), "utf8")).toBe(content);
        } finally {
          config.cleanup();
          rmSync(dir, { recursive: true, force: true });
        }
      },
    );
  }

  it("removes inherited access-token overrides and forces anonymous availability", () => {
    const env = backendEnv({
      CONVEX_OVERRIDE_ACCESS_TOKEN: "dummy-access",
      CONVEX_ALLOW_ANONYMOUS: "false",
    });
    expect(env.CONVEX_OVERRIDE_ACCESS_TOKEN).toBeUndefined();
    expect(env.CONVEX_ALLOW_ANONYMOUS).toBe("true");
  });

  it("refuses to spawn either CLI operation without an explicit config", () => {
    const spawnImpl = vi.fn();
    const spawnSyncImpl = vi.fn();
    expect(() => startBackend({}, { spawnImpl })).toThrow("専用");
    expect(() => runConvexCli(["env", "list"], {}, { spawnSyncImpl })).toThrow("専用");
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });
});

describe("createLocalDeploymentConfig", () => {
  it("creates private, unique configuration and binds later operations to the generated anonymous deployment", () => {
    const config = createLocalDeploymentConfig();
    const other = createLocalDeploymentConfig();
    try {
      expect(config.envFile).not.toBe(other.envFile);
      expect(statSync(config.envFile).mode & 0o777).toBe(0o600);
      config.bind(new Map([["CONVEX_DEPLOYMENT", "anonymous:anonymous-generated"]]));
      expect(selectedDeployment(os.tmpdir(), ["--env-file", config.envFile], {})).toEqual({
        kind: "anonymous",
        deploymentName: "anonymous-generated",
      });
    } finally {
      config.cleanup();
      other.cleanup();
    }
    expect(existsSync(path.dirname(config.envFile))).toBe(false);
    expect(() => config.cleanup()).not.toThrow();
  });

  it.each([
    undefined,
    "prod:dummy",
    "dev:dummy",
    "local:linked-project",
    "anonymous:anonymous-name\nCONVEX_DEPLOY_KEY=dummy",
  ])(
    "rejects invalid generated selectors (%s) without changing the safe bootstrap config",
    (deployment) => {
      const config = createLocalDeploymentConfig();
      try {
        const initial = readFileSync(config.envFile, "utf8");
        expect(() => config.bind(new Map([["CONVEX_DEPLOYMENT", deployment]]))).toThrow(
          "匿名local",
        );
        expect(readFileSync(config.envFile, "utf8")).toBe(initial);
      } finally {
        config.cleanup();
      }
    },
  );
});

describe("backendEnv", () => {
  it("strips cloud deployment overrides and forces anonymous mode", () => {
    const env = backendEnv({
      CONVEX_DEPLOYMENT: "prod:cloud-123",
      CONVEX_DEPLOY_KEY: "key",
      CONVEX_DEPLOYMENT_TOKEN: "token",
      CONVEX_SELF_HOSTED_URL: "https://self.example",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "admin",
      VITE_CONVEX_URL: "https://x.convex.cloud",
      VITE_CONVEX_SITE_URL: "https://x.convex.site",
      KEEP_ME: "1",
    });
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined();
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOYMENT_TOKEN).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_URL).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_ADMIN_KEY).toBeUndefined();
    expect(env.VITE_CONVEX_URL).toBeUndefined();
    expect(env.VITE_CONVEX_SITE_URL).toBeUndefined();
    expect(env.CONVEX_AGENT_MODE).toBe("anonymous");
    expect(env.KEEP_ME).toBe("1");
  });
});

describe("buildChildEnv", () => {
  it("forces a local Playwright server even when a remote base URL is inherited or in fallback", () => {
    const env = buildChildEnv(
      {
        E2E_BASE_URL: "https://dummy.invalid",
        PLAYWRIGHT_BYPASS_SECRET: "dummy-bypass",
        E2E_VITE_PORT: "15173",
      },
      {
        url: "http://127.0.0.1:13210",
        siteUrl: "http://127.0.0.1:13211",
        cleanupSecret: "dummy",
        fallbackEnv: new Map([
          ["E2E_BASE_URL", "https://fallback.invalid"],
          ["E2E_VITE_PORT", "5173"],
        ]),
      },
    );
    expect(env.E2E_ISOLATED).toBe("true");
    expect(env.E2E_BASE_URL).toBeUndefined();
    expect(env.PLAYWRIGHT_BYPASS_SECRET).toBeUndefined();
    expect(env.E2E_VITE_PORT).toBe("15173");
  });
  it.each(CLOUD_SELECTORS)(
    "removes inherited and fallback %s from E2E children",
    (_name, selectors) => {
      const env = buildChildEnv(selectors, {
        url: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        cleanupSecret: "dummy",
        fallbackEnv: new Map(Object.entries(selectors)),
      });
      for (const key of Object.keys(selectors)) expect(env[key]).toBeUndefined();
    },
  );
  it("injects the isolated backend URLs and forces CI mode", () => {
    const env = buildChildEnv(
      { CLERK_PUBLISHABLE_KEY: "pk_test_x", KEEP_ME: "1" },
      { url: "http://127.0.0.1:3210", siteUrl: "http://127.0.0.1:3211", cleanupSecret: "s" },
    );
    expect(env.CI).toBe("true");
    expect(env.VITE_CONVEX_URL).toBe("http://127.0.0.1:3210");
    expect(env.VITE_CONVEX_SITE_URL).toBe("http://127.0.0.1:3211");
    expect(env.E2E_CLEANUP_SECRET).toBe("s");
    expect(env.KEEP_ME).toBe("1");
  });

  it("prepends node_modules/.bin to PATH", () => {
    const env = buildChildEnv({ PATH: "/usr/bin" }, { url: "u", siteUrl: "s", cleanupSecret: "c" });
    expect(env.PATH.startsWith(path.join(process.cwd(), "node_modules", ".bin"))).toBe(true);
    expect(env.PATH).toContain("/usr/bin");
  });

  it("does not duplicate .bin in PATH", () => {
    const binDir = path.join(process.cwd(), "node_modules", ".bin");
    const env = buildChildEnv(
      { PATH: `${binDir}:/usr/bin` },
      { url: "u", siteUrl: "s", cleanupSecret: "c" },
    );
    expect(env.PATH.split(":").filter((p) => p === binDir)).toHaveLength(1);
  });

  it("maps CLERK_PUBLISHABLE_KEY to VITE_CLERK_PUBLISHABLE_KEY when missing", () => {
    const env = buildChildEnv(
      { CLERK_PUBLISHABLE_KEY: "pk_test_x" },
      { url: "u", siteUrl: "s", cleanupSecret: "c" },
    );
    expect(env.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_test_x");
  });

  it("keeps an explicit VITE_CLERK_PUBLISHABLE_KEY", () => {
    const env = buildChildEnv(
      { CLERK_PUBLISHABLE_KEY: "pk_test_a", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_b" },
      { url: "u", siteUrl: "s", cleanupSecret: "c" },
    );
    expect(env.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_test_b");
  });

  it("merges fallback .env.local values without overriding real env or backend values", () => {
    const fallbackEnv = new Map([
      ["VITE_CLERK_PUBLISHABLE_KEY", "pk_test_from_env_local"],
      ["E2E_CLERK_USER_ID", "issuer|user_1"],
      ["E2E_CLERK_USER_EMAIL", "e2e@example.com"],
      ["VITE_CONVEX_URL", "https://stale-cloud.convex.cloud"],
      ["CONVEX_DEPLOYMENT", "prod:stale"],
      ["CONVEX_DEPLOY_KEY", "stale-deploy-key"],
      ["E2E_CLEANUP_SECRET", "stale-secret"],
      ["KEEP_FROM_ENV", "env_wins"],
    ]);
    const env = buildChildEnv(
      { KEEP_FROM_ENV: "real_env" },
      {
        url: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        cleanupSecret: "fresh-secret",
        fallbackEnv,
      },
    );
    // 欠けている変数は .env.local から補う
    expect(env.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_test_from_env_local");
    expect(env.E2E_CLERK_USER_ID).toBe("issuer|user_1");
    expect(env.E2E_CLERK_USER_EMAIL).toBe("e2e@example.com");
    // 実環境変数が優先
    expect(env.KEEP_FROM_ENV).toBe("real_env");
    // backend 生成物は今回生成した値だけを引き継ぐ
    expect(env.VITE_CONVEX_URL).toBe("http://127.0.0.1:3210");
    expect(env.E2E_CLEANUP_SECRET).toBe("fresh-secret");
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined();
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
  });
});

describe("generateCleanupSecret", () => {
  it("returns a 64-char hex string, unique per call", () => {
    const a = generateCleanupSecret();
    const b = generateCleanupSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("redact", () => {
  it("replaces every occurrence of sensitive values", () => {
    expect(redact("token abc and abc again", ["abc"])).toBe(
      "token [REDACTED] and [REDACTED] again",
    );
    expect(redact("nothing", [undefined, ""])).toBe("nothing");
  });
});
