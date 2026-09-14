import { describe, expect, it } from "vitest";
import {
  assertGroupSelected,
  assertReceiptImageConsent,
  assertValidImageDataUrl,
  ReceiptImageExtractionDomainError,
  resolveExtractionPlan,
} from "./rules";

describe("assertValidImageDataUrl", () => {
  it("有効な data URL は通す", () => {
    expect(() =>
      assertValidImageDataUrl("data:image/jpeg;base64," + "A".repeat(100)),
    ).not.toThrow();
  });
  it("不正な形式はドメインエラー", () => {
    expect(() => assertValidImageDataUrl("https://example.com/a.jpg")).toThrow(
      ReceiptImageExtractionDomainError,
    );
  });
});

describe("resolveExtractionPlan", () => {
  it("mode 未設定・非production は mock", () => {
    expect(
      resolveExtractionPlan({
        appEnv: undefined,
        extractorMode: undefined,
        openAiApiKey: undefined,
      }),
    ).toEqual({ kind: "mock" });
  });

  it("production で mode 未設定は missing_required 文言", () => {
    expect(() =>
      resolveExtractionPlan({ appEnv: "production", extractorMode: undefined, openAiApiKey: "k" }),
    ).toThrow("RECEIPT_IMAGE_EXTRACTOR_MODE を production では必ず設定してください");
  });

  it("不正な mode は invalid 文言", () => {
    expect(() =>
      resolveExtractionPlan({ appEnv: "development", extractorMode: "foo", openAiApiKey: "k" }),
    ).toThrow("RECEIPT_IMAGE_EXTRACTOR_MODE は mock または real のどちらかを指定してください");
  });

  it("real × 非production はガード文言（APP_ENV 既定 development を含む）", () => {
    expect(() =>
      resolveExtractionPlan({ appEnv: undefined, extractorMode: "real", openAiApiKey: "k" }),
    ).toThrow("real モードは APP_ENV=production のときのみ利用できます（現在: development）");
    expect(() =>
      resolveExtractionPlan({ appEnv: "preview", extractorMode: "real", openAiApiKey: "k" }),
    ).toThrow("（現在: preview）");
  });

  it("real × production × キー未設定は APIキー文言", () => {
    expect(() =>
      resolveExtractionPlan({ appEnv: "production", extractorMode: "real", openAiApiKey: "" }),
    ).toThrow("OPENAI_API_KEY が設定されていません。Convex Dashboard で環境変数を設定してください");
  });

  it("real × production × キーあり は real plan", () => {
    expect(
      resolveExtractionPlan({ appEnv: "production", extractorMode: "real", openAiApiKey: "sk" }),
    ).toEqual({ kind: "real", apiKey: "sk" });
  });
});

describe("assertGroupSelected / assertReceiptImageConsent", () => {
  it("group null は「グループを選択してください」", () => {
    expect(() => assertGroupSelected(null)).toThrow("グループを選択してください");
    const g = { id: 1 };
    expect(assertGroupSelected(g)).toBe(g);
  });
  it("未承認は同意必須文言", () => {
    expect(() => assertReceiptImageConsent({ hasAcceptedExternalApiConsent: false })).toThrow(
      "Receipt image external API consent is required",
    );
    expect(() => assertReceiptImageConsent({ hasAcceptedExternalApiConsent: true })).not.toThrow();
  });
});
