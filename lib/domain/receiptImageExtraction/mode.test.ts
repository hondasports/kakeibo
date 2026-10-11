import { describe, expect, it } from "vitest";
import { getResolveExtractorModeErrorMessage, resolveExtractorMode } from "./mode";

describe("resolveExtractorMode", () => {
  it("mode が未設定の場合、production ではエラー、それ以外は mock を返す", () => {
    expect(resolveExtractorMode({ appEnv: "production" })).toEqual({
      error: "missing_required",
    });
    expect(resolveExtractorMode({ appEnv: "development" })).toEqual({
      mode: "mock",
    });
  });

  it("空文字の mode は未設定と同じ扱い", () => {
    expect(resolveExtractorMode({ appEnv: "production", mode: "" })).toEqual({
      error: "missing_required",
    });
    expect(resolveExtractorMode({ appEnv: "development", mode: "" })).toEqual({
      mode: "mock",
    });
  });

  it("mock / real はそのまま返す", () => {
    expect(resolveExtractorMode({ appEnv: "production", mode: "mock" })).toEqual({
      mode: "mock",
    });
    expect(resolveExtractorMode({ appEnv: "production", mode: "real" })).toEqual({
      mode: "real",
    });
  });

  it("それ以外の mode は invalid エラー", () => {
    expect(resolveExtractorMode({ appEnv: "production", mode: "auto" })).toEqual({
      error: "invalid",
    });
  });
});

describe("getResolveExtractorModeErrorMessage", () => {
  it.each([
    ["missing_required", "RECEIPT_IMAGE_EXTRACTOR_MODE を production では必ず設定してください"],
    ["invalid", "RECEIPT_IMAGE_EXTRACTOR_MODE は mock または real のどちらかを指定してください"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(getResolveExtractorModeErrorMessage(error)).toBe(expected);
  });
});

describe("resolveExtractorMode の APP_ENV allow-list", () => {
  it.each([undefined, "", "prod", "Production", "preview"])(
    "APP_ENV=%s は mode 未設定でも mock に落とさず拒否する",
    (appEnv) => {
      expect(resolveExtractorMode({ appEnv, mode: undefined })).toEqual({
        error: "invalid_app_env",
      });
      expect(resolveExtractorMode({ appEnv, mode: "mock" })).toEqual({
        error: "invalid_app_env",
      });
    },
  );

  it("invalid_app_env の文言は APP_ENV を名指しする", () => {
    expect(getResolveExtractorModeErrorMessage("invalid_app_env")).toMatch(/APP_ENV/);
  });
});
