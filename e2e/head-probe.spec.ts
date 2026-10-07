import { test, expect } from "@playwright/test";

/**
 * #956 AC2 検証用の一時spec。
 * `/e2e/head-probe` はこのブランチにだけ存在するHTTP action。
 * CIのE2EがPR HEADのconvex関数を反映したbackendで動くなら200になる。
 * （共有cloud devなら存在しないので404/応答なしになる）
 */
test.describe("head probe (#956)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@public PR HEADのconvex関数がE2E backendに反映される", async ({ request }) => {
    const siteUrl = process.env.VITE_CONVEX_SITE_URL;
    expect(siteUrl, "VITE_CONVEX_SITE_URL が必要").toBeTruthy();

    const res = await request.get(`${siteUrl}/e2e/head-probe`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.marker).toBe("i956-head-probe");
  });
});
