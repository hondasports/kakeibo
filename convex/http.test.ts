import { afterEach, describe, expect, it, vi } from "vitest";

const originalAppEnv = process.env.APP_ENV;

afterEach(() => {
  vi.doUnmock("convex/server");
  vi.resetModules();
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
});

async function loadRegisteredPaths(appEnv: string | undefined) {
  if (appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnv;

  const registeredPaths: string[] = [];
  vi.doMock("convex/server", async () => {
    const actual = await vi.importActual<typeof import("convex/server")>("convex/server");
    return {
      ...actual,
      httpRouter: () => ({
        route: (definition: { path: string }) => {
          registeredPaths.push(definition.path);
        },
      }),
    };
  });

  const { default: http } = await import("./http");
  expect(http).toBeDefined();
  return registeredPaths;
}

describe("HTTP router route registration", () => {
  it.each([undefined, "development", "production", "preview", "unknown"])(
    "%sでもE2Eルートを登録する",
    async (appEnv) => {
      const paths = await loadRegisteredPaths(appEnv);

      expect(paths).toEqual([
        "/e2e/cleanup-auth-check",
        "/e2e/cleanup",
        "/e2e/seed-system-admin-membership",
        "/e2e/cleanup-system-admin-membership",
        "/e2e/seed-system-admin-search",
        "/e2e/cleanup-system-admin-search",
        "/e2e/seed-ai-expense-draft",
        "/e2e/seed-tax-review-draft",
        "/e2e/seed-mixed-tax-review-draft",
        "/e2e/seed-tax-summary-conflict-draft",
        "/e2e/seed-pending-group-invitation",
        "/webhooks/resend",
        "/webhooks/line",
        "/e2e/seed-unallocated-tax-draft",
      ]);
    },
  );
});
