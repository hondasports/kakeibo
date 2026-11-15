import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("App.css のレスポンシブ境界", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
  const mediaWidths = [...css.matchAll(/\(\s*(min|max)-width:\s*(\d+)px\s*\)/g)].map(
    (match) => `${match[1]}-width: ${match[2]}px`,
  );

  it("スマートフォンとPCの境界はMUIのmd（900px）で、スマートフォン側はPC側の補集合で書く", () => {
    expect(theme.breakpoints.values.md).toBe(900);
    expect(css).toContain("@media not all and (min-width: 900px)");
    expect(mediaWidths).toContain("min-width: 900px");
  });

  it("max-width: 899px を使わない（899pxと900pxの間の小数幅でシェルと一覧の切替がずれるため）", () => {
    expect(mediaWidths).not.toContain("max-width: 899px");
  });

  it("境界は900px・小型スマホ向けの390/320px・PCの列調整の1199px以外を使わない（シェルと一覧の切替幅がずれるため）", () => {
    const allowed = new Set([
      "min-width: 900px",
      "max-width: 1199px",
      "max-width: 390px",
      "max-width: 320px",
    ]);
    expect([...new Set(mediaWidths)].filter((width) => !allowed.has(width))).toEqual([]);
  });
});
