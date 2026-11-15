import { vi } from "vitest";

/** jsdom の既定の幅。PC（MUIのmd＝900px以上）として扱う */
export const DEFAULT_TEST_VIEWPORT_WIDTH = 1280;

function matchesWidthQuery(query: string, width: number) {
  const conditions = [...query.matchAll(/\(\s*(min|max)-width:\s*([\d.]+)px\s*\)/g)];
  if (conditions.length === 0) return false;
  return conditions.every(([, kind, value]) =>
    kind === "min" ? width >= Number(value) : width <= Number(value),
  );
}

/**
 * `window.matchMedia` を、指定した幅で評価するスタブに置き換える。
 * MUIの `breakpoints.up/down` が作る `(min-width:Npx)` / `(max-width:Npx)` を実際の幅で判定するので、
 * `up` と `down` の取り違えがあるとテストが失敗する。幅以外のクエリは一致しない。
 */
export function stubViewportWidth(width: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesWidthQuery(query, width),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
}
