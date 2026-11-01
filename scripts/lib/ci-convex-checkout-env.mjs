/**
 * checkoutの `.env.local` の退避・復元と、退避ファイルのfallback読み出しを所有する。
 * anonymous local deploymentは `.env.local` を書き換えるため、開発者の通常の接続先を
 * `.env.local.e2e-isolated.bak` へ逃がし、終了時に元の状態へ戻す。
 */

import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { parseEnvFile } from "../sync-e2e-env.mjs";
import { repoRoot } from "./ci-convex-env-boundary.mjs";

export const envLocalPath = resolve(repoRoot, ".env.local");
export const envBackupPath = resolve(repoRoot, ".env.local.e2e-isolated.bak");

/**
 * 既存の `.env.local` をバックアップとして退避する。
 * anonymous deploymentは `.env.local` を書き換えるため、ユーザーの
 * 通常開発用の接続先を終了時に復元できるようにする。
 * 前回異常終了で `.bak` が残っていた場合は先に復元する。
 */
export function backupEnvLocal({ envPath = envLocalPath, backupPath = envBackupPath } = {}) {
  if (existsSync(backupPath) && !existsSync(envPath)) {
    renameSync(backupPath, envPath);
  }
  if (existsSync(envPath)) {
    copyFileSync(envPath, backupPath);
    rmSync(envPath);
    return true;
  }
  return false;
}

export function restoreEnvLocal({ envPath = envLocalPath, backupPath = envBackupPath } = {}) {
  if (existsSync(backupPath)) {
    if (existsSync(envPath)) rmSync(envPath);
    renameSync(backupPath, envPath);
    return true;
  }
  // .env.local が新規作成されただけなら削除して元の「無い」状態に戻す
  if (existsSync(envPath)) rmSync(envPath);
  return false;
}

/**
 * 退避した `.env.local` をfallback値として読む。ローカルで `pnpm run e2e:isolated`
 * を実行する際、開発者の .env.local に入っている E2E_CLERK_USER_ID 等を
 * 環境変数 export なしで引き継ぐため。CIのcheckoutには .env.local が無いので
 * そこでは何もしない。
 */
export function readBackedUpEnv({ backupPath = envBackupPath } = {}) {
  if (!existsSync(backupPath)) return null;
  return parseEnvFile(readFileSync(backupPath, "utf8"));
}
