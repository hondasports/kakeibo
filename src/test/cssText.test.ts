import { describe, expect, it } from "vitest";
import { mediaMinWidthRule } from "./cssText";

describe("mediaMinWidthRule", () => {
  it("メディアブロック内のクラス宣言にマッチする", () => {
    const css = "@media (min-width:900px){.css-target{position:static}}";
    expect(css).toMatch(mediaMinWidthRule("css-target", "900px", "position:\\s*static"));
  });

  it("メディアブロック内に他のルールがあってもマッチする", () => {
    const css = "@media (min-width:900px){.css-other{color:red}.css-target{position:static}}";
    expect(css).toMatch(mediaMinWidthRule("css-target", "900px", "position:\\s*static"));
  });

  it("メディアブロックを閉じた後の同名クラスにはマッチしない", () => {
    const css = "@media (min-width:900px){.css-other{color:red}}\n.css-target{position:sticky}";
    expect(css).not.toMatch(mediaMinWidthRule("css-target", "900px", "position:[^;}]*sticky"));
  });

  it("指定と異なるmin-widthのメディアブロック内のルールにはマッチしない", () => {
    const css = "@media (min-width:600px){.css-target{position:sticky}}";
    expect(css).not.toMatch(mediaMinWidthRule("css-target", "900px", "position:[^;}]*sticky"));
  });

  it("対象クラスが複数のメディアブロックにあるとき指定したmin-widthのブロックだけを見る", () => {
    const css =
      "@media (min-width:0px){.css-target{position:sticky}}" +
      "@media (min-width:900px){.css-target{position:static}}";
    expect(css).toMatch(mediaMinWidthRule("css-target", "900px", "position:\\s*static"));
    expect(css).not.toMatch(mediaMinWidthRule("css-target", "900px", "position:[^;}]*sticky"));
  });
});
