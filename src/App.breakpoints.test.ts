import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

  it('本番コードはMUIのbreakpoints.down("md")を使わない（899.95pxまでしか一致せず、シェルと切替幅がずれるため。PC側のup("md")の否定で判定する）', () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const productionFiles = (
      readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }) as string[]
    ).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    const offenders = productionFiles.filter((file) =>
      /breakpoints\.down\(\s*["']md["']\s*\)/.test(readFileSync(join(sourceRoot, file), "utf8")),
    );

    expect(productionFiles.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('theme.ts のSP向け上書きは "@media not all and (min-width: 900px)" を使う（breakpoints.not("md") は1200px以上にも適用されてPCで44pxになるため）', () => {
    const source = readFileSync(resolve(process.cwd(), "src/theme.ts"), "utf8");
    expect(source).not.toMatch(/breakpoints\.not\(\s*["']md["']\s*\)/);
    expect(source).toContain("@media not all and (min-width: 900px)");
  });
});

describe("週次サマリーのカテゴリ別表の列幅（PC・2列カード内に収める）", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
  const rowRule = css.match(/\.weekly-category-header,\s*\.weekly-category-row\s*\{([^}]*)\}/);
  const columns = rowRule?.[1].match(/grid-template-columns:\s*([^;]+);/)?.[1].trim() ?? "";
  const tracks = columns.match(/minmax\([^)]*\)|\S+/g) ?? [];

  it("名前の列は0pxから縮められる（minmax(0, …)）", () => {
    expect(tracks[0]).toMatch(/^minmax\(\s*0(px)?\s*,/);
  });

  it("固定幅の列と列間隔の合計が、PC側の2列カードの最小内幅（約316px）の中で名前の列を残せる（240px以下）", () => {
    const toPx = (track: string) => {
      const match = track.match(/^(\d+(?:\.\d+)?)(px|rem)$/);
      if (!match) return null;
      return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
    };
    const fixedPx = tracks.slice(1).map(toPx);
    expect(fixedPx.every((px) => px !== null)).toBe(true);
    const gapPx = 3 * 12; // var(--space-sm) = 12px、列は4つ
    expect(fixedPx.reduce<number>((sum, px) => sum + (px ?? 0), 0) + gapPx).toBeLessThanOrEqual(
      240,
    );
  });
});
