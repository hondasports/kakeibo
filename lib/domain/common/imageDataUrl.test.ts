import { describe, expect, it } from "vitest";
import {
  getImageDataUrlErrorMessage,
  MAX_IMAGE_DATA_URL_LENGTH,
  validateImageDataUrl,
} from "./imageDataUrl";

describe("imageDataUrl", () => {
  it("data URL の最大長は Convex 1MB 制限を下回る 900000 文字", () => {
    expect(MAX_IMAGE_DATA_URL_LENGTH).toBe(900_000);
  });

  it("JPEG の Data URL は有効", () => {
    expect(validateImageDataUrl("data:image/jpeg;base64,abcd").success).toBe(true);
  });

  it("Data URL 形式でない場合は invalid_format", () => {
    expect(validateImageDataUrl("https://example.com")).toEqual({
      success: false,
      error: "invalid_format",
    });
  });

  it("base64 マーカーがない場合は missing_base64_marker", () => {
    expect(validateImageDataUrl("data:image/jpeg,abcd")).toEqual({
      success: false,
      error: "missing_base64_marker",
    });
  });

  it("長さ超過の場合は too_large", () => {
    const large = `data:image/jpeg;base64,${"a".repeat(MAX_IMAGE_DATA_URL_LENGTH)}`;
    expect(validateImageDataUrl(large)).toEqual({
      success: false,
      error: "too_large",
    });
  });

  it("base64 ボディが空の場合は empty_base64", () => {
    expect(validateImageDataUrl("data:image/jpeg;base64,")).toEqual({
      success: false,
      error: "empty_base64",
    });
  });

  it("対応外 MIME タイプの場合は unsupported_mime_type", () => {
    expect(validateImageDataUrl("data:image/svg;base64,abcd")).toEqual({
      success: false,
      error: "unsupported_mime_type",
    });
  });

  it("不正な base64 の場合は invalid_base64", () => {
    expect(validateImageDataUrl("data:image/jpeg;base64,abc===")).toEqual({
      success: false,
      error: "invalid_base64",
    });
  });

  it.each(["A", "AA", "AAA", "A=", "AA==", "+/09Az"])(
    "既存の base64 本文 %s を受け付ける",
    (body) => {
      expect(validateImageDataUrl(`data:image/jpeg;base64,${body}`)).toEqual({ success: true });
    },
  );

  it.each(["=", "==", "A===", "A=A", "A==A", "A A", "A\n", "Ａ"])(
    "不正な base64 本文 %s を拒否する",
    (body) => {
      expect(validateImageDataUrl(`data:image/jpeg;base64,${body}`)).toEqual({
        success: false,
        error: "invalid_base64",
      });
    },
  );

  it("長い本文でもパディング位置の検証が500ms以内に終わる", () => {
    const dataUrl = `data:image/jpeg;base64,A${"=".repeat(80_000)}A`;
    const start = performance.now();
    expect(validateImageDataUrl(dataUrl)).toEqual({ success: false, error: "invalid_base64" });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("最大長の本文と末尾のパディングを受け付ける", () => {
    const header = "data:image/jpeg;base64,";
    const body = `${"A".repeat(MAX_IMAGE_DATA_URL_LENGTH - header.length - 2)}==`;
    const start = performance.now();
    expect(validateImageDataUrl(`${header}${body}`)).toEqual({ success: true });
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("getImageDataUrlErrorMessage", () => {
  it.each([
    ["invalid_format", "imageDataUrl は Data URL 形式で指定してください"],
    [
      "missing_base64_marker",
      "imageDataUrl は base64 エンコードされた Data URL 形式で指定してください",
    ],
    [
      "too_large",
      "画像サイズが大きすぎます。長辺 1400〜1800px・JPEG にリサイズしてから再試行してください",
    ],
    ["empty_base64", "imageDataUrl の base64 データが空です"],
    [
      "unsupported_mime_type",
      "対応していない画像形式です。JPEG / PNG / WebP / GIF を使用してください",
    ],
    ["invalid_base64", "imageDataUrl の base64 エンコーディングが不正です"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(getImageDataUrlErrorMessage(error)).toBe(expected);
  });
});
