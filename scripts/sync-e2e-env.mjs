#!/usr/bin/env node
/**
 * ローカル E2E 前の .env.local 同期 + Convex E2E 専用設定反映。
 *
 * 正本: docs/development-process.md「`.env.local` 同期」
 * CI では e2e.yml が同等の同期を行うため、CI=true のときは no-op。
 */

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function redactSensitiveText(text, sensitiveValues) {
  return sensitiveValues.reduce(
    (redacted, value) => (value ? redacted.split(value).join("[REDACTED]") : redacted),
    text,
  );
}

export function parseEnvFile(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return values;
}

export function deriveClerkJwtIssuerDomain(publishableKey) {
  const normalizedKey = publishableKey.trim().replace(/^(['"])(.*)\1$/, "$2");
  const match = normalizedKey.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY からCLERK_JWT_ISSUER_DOMAINを特定できません。Clerkのpublishable keyを確認してください。",
    );
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const hostname = decoded.endsWith("$") ? decoded.slice(0, -1) : decoded;

  try {
    const issuer = new URL(`https://${hostname}`);
    if (issuer.hostname !== hostname || issuer.pathname !== "/") {
      throw new Error("invalid Clerk issuer hostname");
    }
    return issuer.origin;
  } catch {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY からCLERK_JWT_ISSUER_DOMAINを特定できません。Clerkのpublishable keyを確認してください。",
    );
  }
}

function listWorktrees() {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? "";
    throw new Error(
      "git worktree list の取得に失敗しました。" + (stderr ? ` (${stderr.trim()})` : ""),
    );
  }

  return result.stdout
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      let path = null;
      let branch = null;
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
        if (line.startsWith("branch ")) branch = line.slice("branch ".length);
      }
      return path ? { path: resolve(path), branch } : null;
    })
    .filter(Boolean);
}

function resolveCanonicalEnvPath(worktrees) {
  if (process.env.KAKEIBO_E2E_ENV_CANONICAL) {
    return resolve(process.env.KAKEIBO_E2E_ENV_CANONICAL);
  }

  const previewWorktree = worktrees.find(({ branch }) => branch === "refs/heads/preview");
  if (!previewWorktree) {
    throw new Error(
      "preview worktree が見つかりません。\n" +
        "初回のみ、元の clone で `git fetch origin preview && git worktree add ../kakeibo-worktrees/preview preview` を実行してください。\n" +
        "ローカル E2E を未実行のまま先へ進めず、preview worktree を用意してから再実行してください。",
    );
  }

  return resolve(previewWorktree.path, ".env.local");
}

function ensureCanonicalEnv(canonicalPath, worktrees) {
  if (existsSync(canonicalPath)) {
    return;
  }

  if (process.env.KAKEIBO_E2E_ENV_CANONICAL) {
    throw new Error(
      `指定された正本 .env.local が見つかりません: ${canonicalPath}\n` +
        "KAKEIBO_E2E_ENV_CANONICAL のパスを修正し、.env.local を復旧してから再実行してください。",
    );
  }

  const mainWorktree = worktrees[0];
  const bootstrapPath = mainWorktree ? resolve(mainWorktree.path, ".env.local") : null;

  if (!bootstrapPath || !existsSync(bootstrapPath)) {
    throw new Error(
      `preview worktree の正本 .env.local が見つかりません: ${canonicalPath}\n` +
        `bootstrap 元: ${bootstrapPath ?? "特定不能"}\n` +
        "最初の worktree の .env.local を復旧するか、preview worktree へ手動でコピーしてから再実行してください。\n" +
        "環境不足を理由に E2E を省略して push / PR へ進めないでください。",
    );
  }

  if (resolve(dirname(canonicalPath)) === resolve(mainWorktree.path)) {
    throw new Error(
      `preview worktree 自体が bootstrap 元ですが .env.local がありません: ${canonicalPath}\n` +
        "ローカル開発用 .env.local を復旧してから再実行してください。",
    );
  }

  copyFileSync(bootstrapPath, canonicalPath);
  console.log(
    `[e2e:env-sync] preview 正本 .env.local を bootstrap しました（元: ${bootstrapPath}）`,
  );
}

function loadLocalEnv() {
  const envPath = resolve(repoRoot, ".env.local");
  if (!existsSync(envPath)) {
    return null;
  }
  return parseEnvFile(readFileSync(envPath, "utf8"));
}

export function isLocalEndpoint(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function hasLocalDeploymentSelection(env) {
  return env?.get("CONVEX_DEPLOYMENT")?.trim().startsWith("local:") ?? false;
}

export function isLocalConvexEnvironment(env) {
  return (
    hasLocalDeploymentSelection(env) &&
    isLocalEndpoint(env?.get("VITE_CONVEX_URL")) &&
    isLocalEndpoint(env?.get("VITE_CONVEX_SITE_URL"))
  );
}

async function verifyCleanupAuth(env) {
  const siteUrl = env.get("VITE_CONVEX_SITE_URL");
  const secret = env.get("E2E_CLEANUP_SECRET");
  const userId = env.get("E2E_CLERK_USER_ID");

  if (!siteUrl || !secret || !userId) {
    throw new Error(
      ".env.local に VITE_CONVEX_SITE_URL / E2E_CLEANUP_SECRET / E2E_CLERK_USER_ID が不足しています。" +
        " 正本 .env.local を復旧して pnpm run e2e:env-sync を再実行してください。",
    );
  }

  const res = await fetch(`${siteUrl}/e2e/cleanup-auth-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Cleanup-Secret": secret,
    },
  });

  if (res.ok) {
    console.log("[e2e:env-sync] E2E cleanup 認証 OK");
    return;
  }

  const text = redactSensitiveText(await res.text(), [secret, userId]);
  if (res.status === 401) {
    throw new Error(
      "E2E cleanup 認証失敗 (401)。.env.local の E2E_CLEANUP_SECRET と Convex deployment が不一致です。" +
        " pnpm run e2e:env-sync を再実行するか、正本 preview worktree の .env.local を更新してください。" +
        " エージェントが独自の secret で convex env set しないこと（GitHub DEV_E2E_CLEANUP_SECRET が正本）。",
    );
  }
  throw new Error(`E2E cleanup 検証失敗: ${res.status} ${text}`);
}

function syncConvexEnv(name, value) {
  const pnpmCommand = process.platform === "win32" ? process.execPath : "pnpm";
  const pnpmArgs =
    process.platform === "win32"
      ? [
          resolve(dirname(process.execPath), "node_modules/corepack/dist/pnpm.js"),
          "exec",
          "convex",
          "env",
          "set",
          name,
          value,
        ]
      : ["exec", "convex", "env", "set", name, value];
  const result = spawnSync(pnpmCommand, pnpmArgs, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  if (result.status !== 0) {
    const combinedOutput = `${result.stdout?.toString() ?? ""}\n${result.stderr?.toString() ?? ""}`;
    const windowsExitAssertionAfterSuccess =
      process.platform === "win32" &&
      combinedOutput.includes(`Successfully set ${name}`) &&
      combinedOutput.includes("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)");
    if (windowsExitAssertionAfterSuccess) {
      console.warn(
        `[e2e:env-sync] ${name} はlocal deploymentへ反映済みです（Convex CLIのWindows終了時assertは疎通確認で判定します）`,
      );
      return;
    }

    const stderr = redactSensitiveText(result.stderr?.toString() ?? "", [value]);
    throw new Error(
      `convex env set ${name} に失敗しました。` +
        " CONVEX_DEPLOYMENT / ログイン状態を確認して再実行してください。" +
        (name === "E2E_CLEANUP_SECRET" ? " この失敗を理由に E2E を省略しないでください。" : "") +
        (stderr ? ` (${stderr.trim()})` : ""),
    );
  }
}

function syncConvexEnvironment(secret, userId, clerkJwtIssuerDomain) {
  if (clerkJwtIssuerDomain) {
    syncConvexEnv("CLERK_JWT_ISSUER_DOMAIN", clerkJwtIssuerDomain);
  }
  syncConvexEnv("APP_ENV", "development");
  syncConvexEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
  syncConvexEnv("E2E_CLERK_USER_ID", userId);
  syncConvexEnv("E2E_CLEANUP_SECRET", secret);
  console.log(
    `[e2e:env-sync] 選択中のConvex deploymentへE2E設定を反映しました${clerkJwtIssuerDomain ? "（local Clerk issuerを含む）" : ""}`,
  );
}

async function main() {
  if (process.env.CI === "true" || process.env.CI === "1") {
    console.log("[e2e:env-sync] CI 環境のためスキップ（e2e.yml が同期担当）");
    return;
  }

  const args = process.argv.slice(2);
  const copyOnly = args.includes("--copy-only");
  const allowCloud = args.includes("--allow-cloud");
  const targetPath = resolve(repoRoot, ".env.local");
  const currentEnv = loadLocalEnv();

  if (hasLocalDeploymentSelection(currentEnv) && !isLocalConvexEnvironment(currentEnv)) {
    throw new Error(
      ".env.local はlocal deploymentを選択していますが、Convexの接続先がlocalではありません。" +
        " `pnpm run dev` または `pnpm run convex:dev -- --once` を先に実行してlocal URLを生成してください。",
    );
  }

  if (!copyOnly && !allowCloud && !isLocalConvexEnvironment(currentEnv)) {
    throw new Error(
      "ローカルE2Eの環境同期を中止しました。通常の開発では `pnpm run dev` でlocal Convexを起動してください。" +
        " cloud dev deploymentを明示的に使う場合だけ `pnpm run e2e:env-sync:cloud` を実行してください。",
    );
  }

  if (isLocalConvexEnvironment(currentEnv)) {
    console.log("[e2e:env-sync] local .env.local を維持します（cloudの正本で上書きしません）");
  }

  const worktrees = listWorktrees();
  if (!isLocalConvexEnvironment(currentEnv)) {
    const canonicalPath = resolveCanonicalEnvPath(worktrees);
    ensureCanonicalEnv(canonicalPath, worktrees);

    if (resolve(canonicalPath) !== targetPath) {
      copyFileSync(canonicalPath, targetPath);
      console.log(`[e2e:env-sync] .env.local を同期しました（正本: ${canonicalPath}）`);
    } else {
      console.log(`[e2e:env-sync] 現在の .env.local を正本として使用します（${canonicalPath}）`);
    }
  }

  if (copyOnly) {
    console.log("[e2e:env-sync] --copy-only のため、Convex deploymentの環境変数は変更していません");
    return;
  }

  const env = loadLocalEnv();
  if (!env) {
    throw new Error(".env.local の読み込みに失敗しました");
  }

  if (!allowCloud && !isLocalConvexEnvironment(env)) {
    throw new Error(
      "cloud Convex deploymentへのE2E環境変数反映を拒否しました。" +
        " `pnpm run convex:dev` でlocal deploymentへ切り替えるか、必要性を確認したうえで `pnpm run e2e:env-sync:cloud` を使ってください。",
    );
  }

  const secret = env.get("E2E_CLEANUP_SECRET");
  if (!secret) {
    throw new Error(".env.local に E2E_CLEANUP_SECRET がありません");
  }
  const userId = env.get("E2E_CLERK_USER_ID");
  if (!userId) {
    throw new Error(".env.local に E2E_CLERK_USER_ID がありません");
  }

  let clerkJwtIssuerDomain;
  if (env.get("CONVEX_DEPLOYMENT")?.startsWith("local:")) {
    const publishableKey = env.get("VITE_CLERK_PUBLISHABLE_KEY");
    if (!publishableKey) {
      throw new Error(".env.local に VITE_CLERK_PUBLISHABLE_KEY がありません");
    }
    clerkJwtIssuerDomain = deriveClerkJwtIssuerDomain(publishableKey);
  }

  syncConvexEnvironment(secret, userId, clerkJwtIssuerDomain);
  await verifyCleanupAuth(env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
