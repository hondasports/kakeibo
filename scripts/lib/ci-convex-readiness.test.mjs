import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCAL_ENV_CONTENT } from "../helpers/ci-convex-test-fixtures.mjs";
import {
  waitForCleanupAuth,
  waitForFunctionsReady,
  waitForLocalEnvFile,
} from "./ci-convex-readiness.mjs";

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
