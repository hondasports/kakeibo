import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
};

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;
const securityHeaders = new Map(
  vercelConfig.headers?.flatMap((entry) =>
    entry.headers.map((header) => [header.key, header.value]),
  ) ?? [],
);
const contentSecurityPolicy = securityHeaders.get("Content-Security-Policy") ?? "";

function getDirectiveSources(directiveName: string) {
  const directive = contentSecurityPolicy
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${directiveName} `));

  return directive?.split(/\s+/).slice(1) ?? [];
}

describe("Vercel security headers", () => {
  it("全パスにブラウザ防御ヘッダーを適用する", () => {
    expect(vercelConfig.headers?.map((entry) => entry.source)).toContain("/(.*)");
    expect(securityHeaders.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(securityHeaders.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(securityHeaders.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(securityHeaders.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(securityHeaders.get("X-Content-Type-Options")).toBe("nosniff");
    expect(securityHeaders.get("X-Frame-Options")).toBe("DENY");
    expect(securityHeaders.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(securityHeaders.get("Permissions-Policy")).toContain("camera=()");
  });

  it("ClerkのブラウザSDKを許可されたドメインから読み込める", () => {
    const scriptSources = getDirectiveSources("script-src");

    expect(scriptSources).toContain("'self'");
    expect(scriptSources).toContain("https://*.clerk.accounts.dev");
    expect(scriptSources).toContain("https://*.clerk.accounts.com");
    expect(scriptSources).toContain("https://*.clerk.com");
  });

  it("Clerk ProductionのカスタムFAPIを必要な通信だけに許可する", () => {
    const clerkProductionOrigin = "https://clerk.suzumemo.jp";

    expect(getDirectiveSources("script-src")).toContain(clerkProductionOrigin);
    expect(getDirectiveSources("connect-src")).toContain(clerkProductionOrigin);
    expect(getDirectiveSources("frame-src")).not.toContain(clerkProductionOrigin);
    expect(getDirectiveSources("form-action")).not.toContain(clerkProductionOrigin);
    expect(contentSecurityPolicy).not.toContain("https://*.suzumemo.jp");
  });
});
