import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { LOCAL_ENV_CONTENT } from "../helpers/ci-convex-test-fixtures.mjs";
import { cleanupIsolatedBackend } from "./ci-convex-backend.mjs";
import { backupEnvLocal, restoreEnvLocal } from "./ci-convex-checkout-env.mjs";
import { createLocalDeploymentConfig } from "./ci-convex-env-boundary.mjs";

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
