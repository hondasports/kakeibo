import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

import {
  backendEnv,
  backupEnvLocal,
  buildChildEnv,
  cleanupIsolatedBackend,
  createLocalDeploymentConfig,
  generateCleanupSecret,
  parseArgs,
  readBackedUpEnv,
  redact,
  restoreEnvLocal,
  runConvexCli,
  startBackend,
  waitForCleanupAuth,
  waitForFunctionsReady,
  waitForLocalEnvFile,
} from "./start-ci-convex.mjs";

const LOCAL_ENV_CONTENT = [
  "CONVEX_DEPLOYMENT=local:anonymous-test",
  "VITE_CONVEX_URL=http://127.0.0.1:3210",
  "VITE_CONVEX_SITE_URL=http://127.0.0.1:3211",
].join("\n");

const require = createRequire(import.meta.url);
const convexBundle = path.resolve(
  path.dirname(require.resolve("convex/package.json")),
  "dist/cli.bundle.cjs",
);
const selectionFixture = path.resolve("scripts/helpers/installed-convex-selection.mjs");
const CLOUD_SELECTORS = [
  ["deploy key", { CONVEX_DEPLOY_KEY: "preview:dummy-team:dummy-project|dummy-key" }],
  ["deployment token", { CONVEX_DEPLOYMENT_TOKEN: "preview:dummy-team:dummy-project|dummy-token" }],
  ["deployment", { CONVEX_DEPLOYMENT: "prod:dummy-cloud" }],
  ["project key", { CONVEX_DEPLOY_KEY: "project:dummy-project|dummy-key" }],
  [
    "self hosted",
    {
      CONVEX_SELF_HOSTED_URL: "https://dummy.invalid",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "dummy-admin",
    },
  ],
];

function selectedDeployment(cwd, args, env) {
  const index = args.indexOf("--env-file");
  return JSON.parse(
    execFileSync(
      process.execPath,
      [selectionFixture, convexBundle, ...(index < 0 ? [] : [args[index + 1]])],
      { cwd, env, encoding: "utf8", timeout: 10000 },
    ),
  );
}

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

describe("cleanupIsolatedBackend", () => {
  it.each(["success", "stop failure", "restore failure", "spawn failure"])(
    "removes dedicated config and restores checkout env after %s",
    async (scenario) => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-cleanup-"));
      const envPath = path.join(dir, ".env.local");
      const backupPath = path.join(dir, ".env.local.e2e-isolated.bak");
      const localConfig = createLocalDeploymentConfig({ tempRoot: dir });
      writeFileSync(envPath, "ORIGINAL=dummy\n");
      backupEnvLocal({ envPath, backupPath });
      writeFileSync(envPath, LOCAL_ENV_CONTENT);
      const stopBackendImpl = vi.fn(async () => {
        if (scenario === "stop failure") throw new Error("dummy stop failure");
      });
      const restoreEnv = vi.fn(() => {
        if (scenario === "restore failure") throw new Error("dummy restore failure");
        restoreEnvLocal({ envPath, backupPath });
        return false;
      });
      try {
        const result = cleanupIsolatedBackend({
          backend: scenario === "spawn failure" ? undefined : {},
          localConfig,
          restoreEnv,
          stopBackendImpl,
        });
        if (scenario === "stop failure" || scenario === "restore failure") {
          await expect(result).rejects.toThrow("dummy");
        } else {
          await expect(result).resolves.toBeUndefined();
        }
        expect(restoreEnv).toHaveBeenCalledOnce();
        expect(stopBackendImpl).toHaveBeenCalledTimes(scenario === "spawn failure" ? 0 : 1);
        expect(existsSync(path.dirname(localConfig.envFile))).toBe(false);
        if (scenario === "restore failure") {
          expect(readFileSync(backupPath, "utf8")).toBe("ORIGINAL=dummy\n");
        } else {
          expect(readFileSync(envPath, "utf8")).toBe("ORIGINAL=dummy\n");
        }
      } finally {
        localConfig.cleanup();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("parseArgs", () => {
  it("parses --run, --probe, --timeout and trailing args", () => {
    const args = parseArgs([
      "--run",
      "pnpm run e2e:smoke",
      "--probe",
      "--timeout",
      "90",
      "--",
      "e2e/auth.spec.ts",
    ]);
    expect(args.run).toBe("pnpm run e2e:smoke");
    expect(args.probe).toBe(true);
    expect(args.timeoutSec).toBe(90);
    expect(args.extraArgs).toEqual(["e2e/auth.spec.ts"]);
  });

  it("defaults to no run command and 120s timeout", () => {
    const args = parseArgs([]);
    expect(args.run).toBeNull();
    expect(args.probe).toBe(false);
    expect(args.timeoutSec).toBe(120);
    expect(args.extraArgs).toEqual([]);
  });

  it("rejects unknown args and invalid timeout", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("不明な引数");
    expect(() => parseArgs(["--timeout", "abc"])).toThrow("--timeout");
    expect(() => parseArgs(["--timeout", "-5"])).toThrow("--timeout");
  });
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

describe("backup/restore .env.local", () => {
  it("backs up an existing file and restores it on cleanup", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      const backupPath = path.join(dir, ".env.local.e2e-isolated.bak");
      writeFileSync(envPath, "ORIGINAL=1\n");
      expect(backupEnvLocal({ envPath, backupPath })).toBe(true);
      expect(existsSync(envPath)).toBe(false);
      writeFileSync(envPath, LOCAL_ENV_CONTENT);
      expect(restoreEnvLocal({ envPath, backupPath })).toBe(true);
      expect(readFileSync(envPath, "utf8")).toBe("ORIGINAL=1\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes a newly created .env.local when there was no original", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      const backupPath = path.join(dir, ".env.local.e2e-isolated.bak");
      expect(backupEnvLocal({ envPath, backupPath })).toBe(false);
      writeFileSync(envPath, LOCAL_ENV_CONTENT);
      expect(restoreEnvLocal({ envPath, backupPath })).toBe(false);
      expect(existsSync(envPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recovers a leftover backup from a crashed run before backing up again", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      const backupPath = path.join(dir, ".env.local.e2e-isolated.bak");
      writeFileSync(backupPath, "CRASH_RECOVERY=1\n");
      backupEnvLocal({ envPath, backupPath });
      // 残っていた .bak が .env.local へ戻り、そのまま再度バックアップに移る
      expect(existsSync(envPath)).toBe(false);
      expect(readFileSync(backupPath, "utf8")).toBe("CRASH_RECOVERY=1\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("waitForLocalEnvFile", () => {
  it("does not accept a backend on ports other than the requested pair", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      writeFileSync(envPath, LOCAL_ENV_CONTENT);
      await expect(
        waitForLocalEnvFile({
          envPath,
          intervalMs: 1,
          timeoutMs: 10,
          ports: { convexCloud: 13210, convexSite: 13211 },
        }),
      ).rejects.toThrow("local deployment");
      writeFileSync(
        envPath,
        LOCAL_ENV_CONTENT.replaceAll("3210", "13210").replaceAll("3211", "13211"),
      );
      await expect(
        waitForLocalEnvFile({ envPath, ports: { convexCloud: 13210, convexSite: 13211 } }),
      ).resolves.toMatchObject({
        url: "http://127.0.0.1:13210",
        siteUrl: "http://127.0.0.1:13211",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([
    ["http://localhost.evil.invalid:3210", "http://127.0.0.1:3211"],
    ["http://127.0.0.1:3210", "https://dummy.convex.site"],
    ["http://dummy@localhost:3210", "http://127.0.0.1:3211"],
    ["https://127.0.0.1:3210", "http://127.0.0.1:3211"],
  ])("rejects non-local generated URL pair (%s, %s)", async (url, siteUrl) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      writeFileSync(envPath, `VITE_CONVEX_URL=${url}\nVITE_CONVEX_SITE_URL=${siteUrl}\n`);
      await expect(waitForLocalEnvFile({ envPath, intervalMs: 1, timeoutMs: 10 })).rejects.toThrow(
        "local deployment",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves once the env file contains local URLs", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      setTimeout(() => writeFileSync(envPath, LOCAL_ENV_CONTENT), 10);
      const result = await waitForLocalEnvFile({ envPath, intervalMs: 5, timeoutMs: 2000 });
      expect(result.url).toBe("http://127.0.0.1:3210");
      expect(result.siteUrl).toBe("http://127.0.0.1:3211");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores env files pointing at a cloud deployment", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const envPath = path.join(dir, ".env.local");
      writeFileSync(
        envPath,
        "VITE_CONVEX_URL=https://shared.convex.cloud\nVITE_CONVEX_SITE_URL=https://shared.convex.site\n",
      );
      await expect(waitForLocalEnvFile({ envPath, intervalMs: 5, timeoutMs: 100 })).rejects.toThrow(
        "local deployment",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("waitForFunctionsReady", () => {
  it("resolves when the ready marker appears in the log", async () => {
    let log = "";
    setTimeout(() => {
      log = "work\nConvex functions ready! (123ms)";
    }, 10);
    await expect(
      waitForFunctionsReady({ getLog: () => log, intervalMs: 5, timeoutMs: 2000 }),
    ).resolves.toBeUndefined();
  });

  it("times out when the marker never appears", async () => {
    await expect(
      waitForFunctionsReady({ getLog: () => "still pushing", intervalMs: 5, timeoutMs: 50 }),
    ).rejects.toThrow("関数反映");
  });
});

describe("readBackedUpEnv", () => {
  it("returns parsed env from a backup file, null when absent", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ci-convex-"));
    try {
      const backupPath = path.join(dir, ".env.local.e2e-isolated.bak");
      expect(readBackedUpEnv({ backupPath })).toBeNull();
      writeFileSync(backupPath, "E2E_CLERK_USER_ID=issuer|user_1\n");
      expect(readBackedUpEnv({ backupPath })?.get("E2E_CLERK_USER_ID")).toBe("issuer|user_1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("waitForCleanupAuth", () => {
  it("resolves once the endpoint returns 200", async () => {
    let calls = 0;
    const fetchImpl = async () => ({ status: ++calls < 3 ? 503 : 200 });
    await expect(
      waitForCleanupAuth({
        siteUrl: "http://127.0.0.1:3211",
        secret: "s",
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 2000,
      }),
    ).resolves.toBe(200);
    expect(calls).toBe(3);
  });

  it("acceptAnyResponse returns the first HTTP status (probe mode)", async () => {
    let calls = 0;
    const fetchImpl = async () => ({ status: ++calls === 1 ? 503 : 200 });
    await expect(
      waitForCleanupAuth({
        siteUrl: "http://127.0.0.1:3211",
        secret: "s",
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 2000,
        acceptAnyResponse: true,
      }),
    ).resolves.toBe(503);
    expect(calls).toBe(1);
  });

  it("times out with the last observed status on persistent failure", async () => {
    const fetchImpl = async () => ({ status: 401 });
    await expect(
      waitForCleanupAuth({
        siteUrl: "http://127.0.0.1:3211",
        secret: "s",
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 50,
      }),
    ).rejects.toThrow("HTTP 401");
  });
});
