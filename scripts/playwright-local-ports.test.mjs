import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function configFor(env) {
  for (const key of [
    "CI",
    "E2E_BASE_URL",
    "E2E_ISOLATED",
    "E2E_VITE_PORT",
    "E2E_CONVEX_CLOUD_PORT",
    "E2E_CONVEX_SITE_PORT",
  ])
    vi.stubEnv(key, undefined);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return (await import("../playwright.config.ts")).default;
}

describe("Playwright local ports", () => {
  it("preserves default local behavior", async () => {
    const config = await configFor({});
    expect(config.use.baseURL).toBe("http://localhost:5173");
    expect(config.webServer).toMatchObject({
      command: "pnpm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    });
  });

  it("preserves default CI behavior", async () => {
    const config = await configFor({ CI: "true" });
    expect(config.webServer).toMatchObject({
      command: "pnpm run dev:frontend",
      url: "http://localhost:5173",
      reuseExistingServer: false,
    });
  });

  it("preserves explicit remote E2E outside isolated mode", async () => {
    const config = await configFor({ E2E_BASE_URL: "https://dummy.invalid" });
    expect(config.use.baseURL).toBe("https://dummy.invalid");
    expect(config.webServer).toBeUndefined();
  });

  it("starts its own strict-port Vite for custom local ports", async () => {
    const config = await configFor({
      E2E_VITE_PORT: "15173",
      E2E_CONVEX_CLOUD_PORT: "13210",
      E2E_CONVEX_SITE_PORT: "13211",
    });
    expect(config.use.baseURL).toBe("http://localhost:15173");
    expect(config.webServer).toMatchObject({
      command: "pnpm run dev:frontend --port 15173 --strictPort",
      url: "http://localhost:15173",
      reuseExistingServer: false,
    });
  });

  it("does not skip webServer when isolated mode inherits E2E_BASE_URL", async () => {
    const config = await configFor({
      CI: "true",
      E2E_ISOLATED: "true",
      E2E_BASE_URL: "https://dummy.invalid",
      E2E_VITE_PORT: "15173",
    });
    expect(config.use.baseURL).toBe("http://localhost:15173");
    expect(config.webServer).toMatchObject({
      command: "pnpm run dev:frontend --port 15173 --strictPort",
      url: "http://localhost:15173",
      reuseExistingServer: false,
    });
  });

  it("rejects invalid custom configuration before any server starts", async () => {
    await expect(configFor({ E2E_VITE_PORT: "15173;invalid" })).rejects.toThrow("E2E_VITE_PORT");
  });
});
