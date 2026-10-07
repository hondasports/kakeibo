import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  backendEnv,
  backupEnvLocal,
  buildChildEnv,
  generateCleanupSecret,
  parseArgs,
  readBackedUpEnv,
  redact,
  restoreEnvLocal,
  waitForCleanupAuth,
  waitForFunctionsReady,
  waitForLocalEnvFile,
} from "./start-ci-convex.mjs";

const LOCAL_ENV_CONTENT = [
  "CONVEX_DEPLOYMENT=local:anonymous-test",
  "VITE_CONVEX_URL=http://127.0.0.1:3210",
  "VITE_CONVEX_SITE_URL=http://127.0.0.1:3211",
].join("\n");

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
