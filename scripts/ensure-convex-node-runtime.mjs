#!/usr/bin/env node
/**
 * Convex local backend の "use node" action executor 用ランタイムを用意する。
 *
 * local backend は executor 起動時に
 * `~/.nvm/versions/node/v<convex-backend の .nvmrc>/bin/node`
 * （無ければ PATH の `node`）を使い、v20/22/24 以外を
 * DeploymentNotConfiguredForNodeActions として拒否する。
 * ツールチェーンが Node 26 以降の環境でも local backend を動かせるよう、
 * executor 用の Node 24 を `~/.cache/suzumemo/convex-node-runtime/` に置き、
 * 呼び出し側が `convex dev` 系の子プロセスにだけ PATH 先頭へ追加できるようにする。
 * 直接 `pnpm exec convex dev` した場合の fallback として
 * `~/.nvm/versions/node/v<VERSION>` への symlink も張る。
 *
 * PATH の node が既に対応バージョンなら何もしない。
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { arch, homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// executor が要求するバージョン。convex-backend の .nvmrc に合わせる。
// （backend binary 更新で変わることがある）
export const CONVEX_EXECUTOR_NODE_VERSION = "24.22.1";

// get-convex/convex-backend crates/node_executor/src/local.rs の
// check_node_version と同じ受理範囲。Convex が Node 26 をサポートしたら外す。
export function isSupportedForConvexExecutor(version) {
  return /^v(20|22|24)\./.test(version);
}

export function runtimeRoot({ home = homedir() } = {}) {
  return join(home, ".cache", "suzumemo", "convex-node-runtime");
}

function nodeBinName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function nodeVersionOf(nodePath) {
  const result = spawnSync(nodePath, ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * ダウンロード・展開して executor 用 Node を用意し、bin ディレクトリを返す。
 * PATH の node が既に対応済みなら null を返す（呼び出し側は何もしない）。
 */
export async function ensureConvexNodeRuntime({
  log = (message) => process.stdout.write(`${message}\n`),
  version = CONVEX_EXECUTOR_NODE_VERSION,
  home = homedir(),
  fetchImpl = fetch,
} = {}) {
  const current = nodeVersionOf("node");
  if (current && isSupportedForConvexExecutor(current)) return null;

  const root = runtimeRoot({ home });
  const installDir = join(root, `v${version}`);
  const binDir = join(installDir, "bin");
  const nodePath = join(binDir, nodeBinName());
  if (!(existsSync(nodePath) && isSupportedForConvexExecutor(nodeVersionOf(nodePath)))) {
    await installNode({ installDir, version, log, fetchImpl });
    const installed = nodeVersionOf(nodePath);
    if (!installed || !isSupportedForConvexExecutor(installed)) {
      throw new Error(
        `executor用Node ${version} のセットアップに失敗しました（${installed ?? "起動不可"}）`,
      );
    }
  }

  // `pnpm exec convex dev` などスクリプト経由でない呼び出しへの fallback。
  // local backend が参照する nvm レイアウトの優先パスに合わせる。
  const nvmNodeDir = join(home, ".nvm", "versions", "node", `v${version}`);
  if (!existsSync(nvmNodeDir)) {
    try {
      mkdirSync(dirname(nvmNodeDir), { recursive: true });
      symlinkSync(installDir, nvmNodeDir, "dir");
    } catch {
      // symlink不可な環境でも PATH 側の fallback で動くため致命ではない
    }
  }

  log(
    `[convex-node-runtime] executor用 Node ${version} を使用します` +
      `（PATH上のnodeは ${current ?? "未検出"}）`,
  );
  return { binDir, version };
}

function targetName(version) {
  const os = { linux: "linux", darwin: "darwin" }[platform()];
  const cpu = { x64: "x64", arm64: "arm64" }[arch()];
  if (!os || !cpu) {
    throw new Error(
      `executor用Nodeの自動配置は ${platform()}/${arch()} 未対応です。` +
        `Node.js v24 系を nvm でインストールしてください。`,
    );
  }
  return `node-v${version}-${os}-${cpu}`;
}

async function installNode({ installDir, version, log, fetchImpl }) {
  const name = targetName(version);
  const url = `https://nodejs.org/dist/v${version}/${name}.tar.xz`;
  log(`[convex-node-runtime] executor用 Node ${version} を取得します（${url}）`);

  const [archive, checksums] = await Promise.all([
    fetchImpl(url).then((res) => {
      if (!res.ok) throw new Error(`Node ${version} の取得に失敗しました（HTTP ${res.status}）`);
      return res.arrayBuffer();
    }),
    fetchImpl(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`).then((res) =>
      res.ok ? res.text() : null,
    ),
  ]);

  if (checksums) {
    const expected = checksums
      .split("\n")
      .find((line) => line.trimEnd().endsWith(` ${name}.tar.xz`))
      ?.split(/\s+/)[0];
    const actual = createHash("sha256").update(Buffer.from(archive)).digest("hex");
    if (expected && actual !== expected) {
      throw new Error(
        `Node ${version} のチェックサム不一致です（expected ${expected}, got ${actual}）`,
      );
    }
  }

  const workDir = join(tmpdir(), `convex-node-runtime-${process.pid}`);
  const archivePath = join(workDir, `${name}.tar.xz`);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  writeFileSync(archivePath, Buffer.from(archive));

  const extract = spawnSync("tar", ["-xJf", archivePath, "-C", workDir], { encoding: "utf8" });
  if (extract.status !== 0) {
    throw new Error(`Node ${version} の展開に失敗しました: ${extract.stderr.trim()}`);
  }

  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(dirname(installDir), { recursive: true });
  renameSync(join(workDir, name), installDir);
  rmSync(workDir, { recursive: true, force: true });
  chmodSync(join(installDir, "bin", "node"), 0o755);
}

/**
 * executor が参照し得る `node` に、用意した runtime の bin を先頭で見せた env を返す。
 * ensureConvexNodeRuntime の戻り値をそのまま渡す。null なら env をそのまま返す。
 */
export function envWithConvexNodeRuntime(env, runtime) {
  if (!runtime?.binDir) return env;
  return { ...env, PATH: `${runtime.binDir}${delimiter}${env.PATH ?? ""}` };
}

async function main() {
  try {
    const runtime = await ensureConvexNodeRuntime();
    if (!runtime) {
      process.stdout.write(
        "PATH上のNodeは executor 対応済みです。追加のセットアップは不要です。\n",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
