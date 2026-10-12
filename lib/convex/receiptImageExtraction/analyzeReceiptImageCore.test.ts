import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSafeFailureWarning } from "./analyzeReceiptImageCore";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSafeFailureWarning", () => {
  it("文字列の ConvexError は利用者向け文言としてそのまま返す", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getSafeFailureWarning(new ConvexError("画像の形式が不正です"))).toBe(
      "画像の形式が不正です",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("ConvexError 以外の Error は固定文言にし、詳細はサーバーログへ出す", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = getSafeFailureWarning(new Error("APP_ENV is production but mock is enabled"));
    expect(warning).toBe("画像解析に失敗しました");
    expect(warning).not.toContain("APP_ENV");
    expect(spy).toHaveBeenCalledWith("receipt_extraction_unexpected_error", {
      name: "Error",
      message: "APP_ENV is production but mock is enabled",
    });
  });

  it("文字列以外の ConvexError や Error 以外の値も固定文言にする", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getSafeFailureWarning(new ConvexError({ code: "x" }))).toBe("画像解析に失敗しました");
    expect(getSafeFailureWarning("boom")).toBe("画像解析に失敗しました");
  });
});
