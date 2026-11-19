import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type HeaderEntry = { key: string; value: string };
type RouteCondition = { type: string; key?: string; value?: unknown };
type HeaderRule = {
  source: string;
  has?: RouteCondition[];
  missing?: RouteCondition[];
  headers: HeaderEntry[];
};

type VercelConfig = {
  headers?: HeaderRule[];
};

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;
const headerRules = vercelConfig.headers ?? [];

const PRODUCTION_HOST_PATTERN = "^(www\\.)?suzumemo\\.jp$";
const CLERK_DEVELOPMENT_DOMAINS = [
  "https://*.clerk.accounts.dev",
  "https://*.clerk.accounts.com",
  "https://*.clerk.com",
];

function getHeaderMap(rule: HeaderRule | undefined) {
  return new Map(rule?.headers.map((header) => [header.key, header.value]) ?? []);
}

function getCsp(rule: HeaderRule | undefined) {
  return getHeaderMap(rule).get("Content-Security-Policy") ?? "";
}

function getDirectiveSources(csp: string, directiveName: string) {
  const directive = csp
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${directiveName} `));

  return directive?.split(/\s+/).slice(1) ?? [];
}

const productionRule = headerRules.find((rule) =>
  rule.has?.some((condition) => condition.type === "host"),
);
const nonProductionRule = headerRules.find((rule) =>
  rule.missing?.some((condition) => condition.type === "host"),
);
const productionCsp = getCsp(productionRule);
const nonProductionCsp = getCsp(nonProductionRule);

describe("Vercel security headers", () => {
  it("全パスにブラウザ防御ヘッダーを適用する", () => {
    for (const rule of [productionRule, nonProductionRule]) {
      const headers = getHeaderMap(rule);

      expect(rule?.source).toBe("/(.*)");
      expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
      expect(headers.get("Content-Security-Policy")).toContain("object-src 'none'");
      expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
      expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headers.get("X-Frame-Options")).toBe("DENY");
      expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headers.get("Permissions-Policy")).toContain("camera=()");
    }
  });

  it("本番hostとそれ以外のhostでCSPルールが互いに排他になる", () => {
    expect(headerRules).toHaveLength(2);
    expect(productionRule?.has).toEqual([{ type: "host", value: PRODUCTION_HOST_PATTERN }]);
    expect(nonProductionRule?.missing).toEqual([{ type: "host", value: PRODUCTION_HOST_PATTERN }]);

    const hostPattern = new RegExp(PRODUCTION_HOST_PATTERN);
    for (const host of ["suzumemo.jp", "www.suzumemo.jp"]) {
      expect(hostPattern.test(host)).toBe(true);
    }
    for (const host of [
      "preview.suzumemo.jp",
      "app-12345.vercel.app",
      "suzumemo.jp.evil.example.com",
      "evil-suzumemo.jp",
    ]) {
      expect(hostPattern.test(host)).toBe(false);
    }
  });

  it("本番hostのCSPはClerk本番ドメインとbot protectionだけを許可する", () => {
    const clerkProductionOrigin = "https://clerk.suzumemo.jp";

    expect(getDirectiveSources(productionCsp, "script-src")).toContain(clerkProductionOrigin);
    expect(getDirectiveSources(productionCsp, "connect-src")).toContain(clerkProductionOrigin);
    expect(getDirectiveSources(productionCsp, "script-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(getDirectiveSources(productionCsp, "frame-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(getDirectiveSources(productionCsp, "script-src")).toContain(
      "https://*.protect.clerk.com",
    );
    expect(getDirectiveSources(productionCsp, "connect-src")).toContain(
      "https://*.protect.clerk.com:*",
    );
    expect(getDirectiveSources(productionCsp, "frame-src")).toContain(
      "https://*.protect.clerk.com",
    );
    expect(getDirectiveSources(productionCsp, "form-action")).toEqual(["'self'"]);

    for (const domain of CLERK_DEVELOPMENT_DOMAINS) {
      expect(productionCsp).not.toContain(domain);
    }
    expect(productionCsp).not.toContain("api.clerk.com");
    expect(productionCsp).not.toContain("*.suzumemo.jp");
  });

  it("それ以外のhostのCSPは従来どおりClerkの全ドメインを許可する", () => {
    for (const directiveName of ["script-src", "connect-src", "frame-src", "form-action"]) {
      const sources = getDirectiveSources(nonProductionCsp, directiveName);
      for (const domain of CLERK_DEVELOPMENT_DOMAINS) {
        expect(sources).toContain(domain);
      }
    }
    expect(getDirectiveSources(nonProductionCsp, "connect-src")).toContain(
      "https://clerk.suzumemo.jp",
    );
    expect(getDirectiveSources(nonProductionCsp, "connect-src")).toContain("https://api.clerk.com");
    expect(nonProductionCsp).not.toContain("*.suzumemo.jp");
  });

  it("CSP以外のheaderは全hostで同一", () => {
    const productionHeaders = getHeaderMap(productionRule);
    const nonProductionHeaders = getHeaderMap(nonProductionRule);
    const securityHeaderKeys = [...productionHeaders.keys()].filter(
      (key) => key !== "Content-Security-Policy",
    );

    expect([...nonProductionHeaders.keys()].sort()).toEqual([...productionHeaders.keys()].sort());
    for (const key of securityHeaderKeys) {
      expect(nonProductionHeaders.get(key)).toBe(productionHeaders.get(key));
    }
  });
});
