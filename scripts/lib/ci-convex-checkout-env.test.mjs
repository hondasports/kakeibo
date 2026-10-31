import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCAL_ENV_CONTENT } from "../helpers/ci-convex-test-fixtures.mjs";
import { backupEnvLocal, readBackedUpEnv, restoreEnvLocal } from "./ci-convex-checkout-env.mjs";

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
