import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const animationDirectory = resolve("public/animations/suzumemo-loading");

describe("Suzumemo loading Lottie", () => {
  it("3秒ループと左右独立のSVG葉レイヤーを持つ", () => {
    const lottiePath = resolve(animationDirectory, "lottie.json");
    const leftLeafPath = resolve(animationDirectory, "leaf-left.svg");
    const rightLeafPath = resolve(animationDirectory, "leaf-right.svg");

    expect(existsSync(lottiePath)).toBe(true);
    expect(existsSync(leftLeafPath)).toBe(true);
    expect(existsSync(rightLeafPath)).toBe(true);

    const lottie = JSON.parse(readFileSync(lottiePath, "utf8")) as {
      fr: number;
      op: number;
      assets: Array<{ p?: string }>;
      slots?: Record<string, unknown>;
    };

    expect(lottie.fr).toBe(30);
    expect(lottie.op).toBe(90);
    expect(lottie.assets.map((asset) => asset.p)).toEqual(
      expect.arrayContaining(["leaf-left.svg", "leaf-right.svg"]),
    );
    expect(lottie.slots).toHaveProperty("bgColor");
    expect(readFileSync(leftLeafPath, "utf8")).toContain("<path");
    expect(readFileSync(rightLeafPath, "utf8")).toContain("<path");
  });

  it("動きを減らす設定ではアニメーションを停止する", () => {
    const css = readFileSync(resolve("src/features/ui/components/SuzumemoLoading.css"), "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
  });

  it("英字と日本語ロゴをフォント非依存のSVGパスで描画する", () => {
    const wordmark = readFileSync(resolve(animationDirectory, "wordmark.svg"), "utf8");
    const subtitle = readFileSync(resolve(animationDirectory, "subtitle.svg"), "utf8");

    expect(wordmark).not.toContain("<text");
    expect(subtitle).not.toContain("<text");
    expect(wordmark).toContain("<path");
    expect(subtitle).toContain("<path");
  });

  it("全レイヤーを合成したSVGロゴを配布する", () => {
    const logoPath = resolve(animationDirectory, "logo.svg");

    expect(existsSync(logoPath)).toBe(true);
    const logo = readFileSync(logoPath, "utf8");
    expect(logo).toContain('id="leaf-left"');
    expect(logo).toContain('id="leaf-right"');
    expect(logo).not.toContain("<image");
  });

  it("狭い画面では親要素の利用可能幅を超えない", () => {
    const css = readFileSync(resolve("src/features/ui/components/SuzumemoLoading.css"), "utf8");

    expect(css).toContain("width: min(600px, 100%)");
  });

  it("ペーパーカラー1色の半透明オーバーレイとして描画する", () => {
    const css = readFileSync(resolve("src/features/ui/components/SuzumemoLoading.css"), "utf8");
    const state = css.match(/\.suzumemo-loading-state\s*\{(?<rules>[^}]*)\}/)?.groups?.rules;
    const overlay = css.match(/\.suzumemo-loading-state--fullscreen\s*\{(?<rules>[^}]*)\}/)?.groups
      ?.rules;
    const panel = css.match(/\.suzumemo-loading-panel\s*\{(?<rules>[^}]*)\}/)?.groups?.rules;

    expect(overlay).toContain("position: fixed");
    expect(overlay).toContain("inset: 0");
    expect(state).toContain("box-sizing: border-box");
    expect(overlay).toContain("var(--color-brand-paper)");
    expect(overlay).toContain("82%");
    expect(overlay).toContain("transparent");
    expect(overlay).not.toContain("var(--color-primary-dark)");
    expect(panel).toContain("background: transparent");
    expect(panel).not.toContain("border:");
    expect(panel).not.toContain("box-shadow:");
  });

  it("既存SVGを文字ごとにマスクして波状に表示し、dot専用レイヤーを持たない", () => {
    const lottie = JSON.parse(readFileSync(resolve(animationDirectory, "lottie.json"), "utf8")) as {
      layers: Array<{
        refId?: string;
        masksProperties?: unknown[];
        ks: { o: { k?: Array<{ t: number; s: number[] }> } };
      }>;
    };
    const wordmarkLayers = lottie.layers.filter((layer) => layer.refId === "wordmark");
    const subtitleLayers = lottie.layers.filter((layer) => layer.refId === "subtitle");
    const firstVisibleFrames = wordmarkLayers.map(
      (layer) => layer.ks.o.k?.find((frame) => frame.s[0] === 100)?.t,
    );

    expect(wordmarkLayers).toHaveLength(8);
    expect(subtitleLayers).toHaveLength(4);
    expect(
      [...wordmarkLayers, ...subtitleLayers].every((layer) => layer.masksProperties?.length === 1),
    ).toBe(true);
    expect(firstVisibleFrames.every((frame) => typeof frame === "number")).toBe(true);
    expect(firstVisibleFrames).toEqual([...firstVisibleFrames].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(new Set(firstVisibleFrames).size).toBe(8);
    expect(lottie.layers.some((layer) => layer.refId === "dot")).toBe(false);
  });
});
