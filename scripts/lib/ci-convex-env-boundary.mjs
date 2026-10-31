/**
 * 使い捨てbackendが触れてよい環境の境界を所有する。
 * cloud deployment selector・access-token overrideを除去してanonymous localに固定し、
 * 専用 `--env-file` configの生成・bind・cleanup、それを介した `convex` CLIのenv write、
 * 子プロセスへ渡すenv、secretのredact・CI環境への出力を担う。
 * `scripts/start-ci-convex.mjs` からだけ呼ばれ、共有cloud devには接続しない。
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { deriveClerkJwtIssuerDomain } from "../sync-e2e-env.mjs";
import { ensureLineIntegrationMode } from "../ensure-line-integration-mode.mjs";
import { E2E_PORT_ENV_VARS, e2ePortEnv, resolveE2EPorts } from "./isolated-e2e-ports.ts";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BACKEND_ENV_DENYLIST = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "VITE_CONVEX_URL",
  "VITE_CONVEX_SITE_URL",
];

export function convexBinPath() {
  const require = createRequire(import.meta.url);
  return resolve(dirname(require.resolve("convex/package.json")), "bin", "main.js");
}

/**
 * `convex dev` や `convex env` に渡す環境を作る。
 * cloud deploymentを指す環境変数を外し、anonymous modeを強制する。
 * これが無いと端末のCONVEX_DEPLOYMENTに引きずられてcloudへ接続しに行く。
 */
export function backendEnv(base = process.env) {
  const env = { ...base };
  for (const name of BACKEND_ENV_DENYLIST) env[name] = undefined;
  env.CONVEX_AGENT_MODE = "anonymous";
  env.CONVEX_ALLOW_ANONYMOUS = "true";
  return env;
}

export function createLocalDeploymentConfig({ tempRoot = tmpdir() } = {}) {
  const dir = mkdtempSync(resolve(tempRoot, "ci-convex-config-"));
  const envFile = resolve(dir, "deployment.env");
  try {
    writeFileSync(envFile, "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n", { mode: 0o600 });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    envFile,
    bind(env) {
      const deployment = env.get("CONVEX_DEPLOYMENT");
      if (!/^(anonymous|local):anonymous-[a-zA-Z0-9_-]+$/.test(deployment ?? "")) {
        throw new Error("匿名local deployment以外の設定は使用できません");
      }
      writeFileSync(envFile, `CONVEX_DEPLOYMENT=${deployment}\n`);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function localConfigArgs(envFile) {
  if (!envFile) throw new Error("local deployment専用のenv fileが必要です");
  return ["--env-file", envFile];
}

export function generateCleanupSecret() {
  return randomBytes(32).toString("hex");
}

export function redact(text, secrets) {
  return secrets.reduce(
    (acc, value) => (value ? acc.split(value).join("[REDACTED]") : acc),
    String(text ?? ""),
  );
}

export function log(message) {
  process.stdout.write(`[isolated-convex] ${message}\n`);
}

export function maskForCI(value) {
  if (process.env.GITHUB_ACTIONS === "true" && value) {
    process.stdout.write(`::add-mask::${value}\n`);
  }
}

export function appendGithubEnv(envValues) {
  const githubEnvPath = process.env.GITHUB_ENV;
  if (!githubEnvPath) return;
  const lines = Object.entries(envValues)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  appendFileSync(githubEnvPath, `${lines}\n`, { encoding: "utf8" });
}

export function runConvexCli(args, env, { envFile, spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl(
    process.execPath,
    [convexBinPath(), ...args, ...localConfigArgs(envFile)],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
      // CLIがhangしてもGHAのstep timeoutで原因が隠れないよう早期に切る
      timeout: 60_000,
      killSignal: "SIGKILL",
    },
  );
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: `${result.error ? `${result.error.message}\n` : ""}${result.stderr?.toString() ?? ""}`,
  };
}

async function setConvexEnv(env, envFile, name, value, secrets, { attempts = 5 } = {}) {
  let lastDetail = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = runConvexCli(["env", "set", name, value], env, { envFile });
    if (result.status === 0) return;
    lastDetail = redact(`${result.stdout}\n${result.stderr}`, secrets).trim();
    // `.convex/local/default` のcredential書き込みと `convex env` の解決が
    // 微妙にずれる起動直後だけ再試行する（spawnSyncなので Atomics.wait で待つ）
    if (attempt < attempts) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error(`convex env set ${name} に失敗しました。${lastDetail ? ` (${lastDetail})` : ""}`);
}

export async function applyConvexEnv({
  env,
  envFile,
  secrets,
  clerkIssuerDomain,
  e2eClerkUserId,
  clerkSecretKey,
}) {
  const secret = generateCleanupSecret();
  const allSecrets = [...secrets, secret];
  // auth.config.ts が参照する env が無いとpush自体が失敗するため最優先で設定する
  if (clerkIssuerDomain) {
    await setConvexEnv(env, envFile, "CLERK_JWT_ISSUER_DOMAIN", clerkIssuerDomain, allSecrets);
  }
  await setConvexEnv(env, envFile, "APP_ENV", "development", allSecrets);
  await setConvexEnv(env, envFile, "RECEIPT_IMAGE_EXTRACTOR_MODE", "mock", allSecrets);
  if (e2eClerkUserId) {
    await setConvexEnv(env, envFile, "E2E_CLERK_USER_ID", e2eClerkUserId, allSecrets);
  }
  // 招待系actionが Clerk API を呼ぶ経路のため、利用可能なら同期する（throwaway backendのみ）
  if (clerkSecretKey) {
    await setConvexEnv(env, envFile, "CLERK_SECRET_KEY", clerkSecretKey, allSecrets);
  }
  await setConvexEnv(env, envFile, "E2E_CLEANUP_SECRET", secret, allSecrets);
  ensureLineIntegrationMode({
    runConvexEnv: (args) => runConvexCli(args, env, { envFile }),
    log,
  });
  return secret;
}

// 子プロセスへ引き継いではいけない .env.local の値。
// deployment selectorと今回生成し直す値だけを落とし、
// VITE_CLERK_PUBLISHABLE_KEY や E2E_CLERK_USER_* 等は .env.local から補う。
const CHILD_ENV_DENYLIST = new Set([
  ...BACKEND_ENV_DENYLIST,
  "CONVEX_AGENT_MODE",
  "VITE_CONVEX_URL",
  "VITE_CONVEX_SITE_URL",
  "E2E_CLEANUP_SECRET",
  "E2E_BASE_URL",
  "PLAYWRIGHT_BYPASS_SECRET",
  "E2E_ISOLATED",
  ...E2E_PORT_ENV_VARS,
]);

export function buildChildEnv(base, { url, siteUrl, cleanupSecret, fallbackEnv } = {}) {
  const ports = resolveE2EPorts(base);
  const env = backendEnv(base);
  // ローカル実行用: 正本が .env.local のみの環境でも backend生成物以外の
  // Clerk/E2E系変数を子へ届ける（実際の環境変数を .env.local で上書きはしない）
  if (fallbackEnv instanceof Map) {
    for (const [name, value] of fallbackEnv) {
      if (env[name] === undefined && !CHILD_ENV_DENYLIST.has(name)) env[name] = value;
    }
  }
  Object.assign(env, {
    ...e2ePortEnv(ports),
    // CIモードにして playwright の webServer が vite のみ（dev:frontend）を
    // 起動するようにし、sync-e2e-env の .env.local 同期を止める。
    CI: "true",
    E2E_ISOLATED: "true",
    E2E_BASE_URL: undefined,
    PLAYWRIGHT_BYPASS_SECRET: undefined,
    VITE_CONVEX_URL: url,
    VITE_CONVEX_SITE_URL: siteUrl,
    E2E_CLEANUP_SECRET: cleanupSecret,
  });
  // `node scripts/start-ci-convex.mjs` を直接呼ぶCI環境でも
  // `playwright` 等の .bin コマンドが解決できるようにする
  const binDir = resolve(repoRoot, "node_modules", ".bin");
  const delimiter = process.platform === "win32" ? ";" : ":";
  if (env.PATH && !env.PATH.split(delimiter).includes(binDir)) {
    env.PATH = `${binDir}${delimiter}${env.PATH}`;
  } else if (!env.PATH) {
    env.PATH = binDir;
  }
  // CIでは CLERK_PUBLISHABLE_KEY だけが来るので Vite 側が読む名前へ写す
  if (!env.VITE_CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY) {
    env.VITE_CLERK_PUBLISHABLE_KEY = env.CLERK_PUBLISHABLE_KEY;
  }
  return env;
}

export function resolveClerkIssuer(fallbackEnv) {
  const key =
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.VITE_CLERK_PUBLISHABLE_KEY ??
    fallbackEnv?.get("VITE_CLERK_PUBLISHABLE_KEY");
  if (!key) {
    log("CLERK_PUBLISHABLE_KEY 未設定のため CLERK_JWT_ISSUER_DOMAIN は設定しません");
    return null;
  }
  return deriveClerkJwtIssuerDomain(key);
}
