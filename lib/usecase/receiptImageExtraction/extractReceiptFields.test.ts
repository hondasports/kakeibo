import { describe, expect, it, vi } from "vitest";
import type { ReceiptExtractorDeps } from "../../domain/receiptImageExtraction/ports";
import type { ExtractionEnvironment } from "../../domain/receiptImageExtraction/rules";
import { extractReceiptFields } from "./extractReceiptFields";

const VALID = "data:image/jpeg;base64," + "A".repeat(100);

function makeDeps(env: ExtractionEnvironment) {
  const deps: ReceiptExtractorDeps<string> = {
    readEnvironment: vi.fn(() => env),
    extractMock: vi.fn(() => "mock"),
    extractReal: vi.fn(async () => "real"),
  };
  return deps;
}

describe("extractReceiptFields", () => {
  it("検証失敗時は環境を読まない", async () => {
    const deps = makeDeps({ appEnv: undefined, extractorMode: undefined, openAiApiKey: undefined });
    await expect(extractReceiptFields(deps, { imageDataUrl: "bad" })).rejects.toThrow();
    expect(deps.readEnvironment).not.toHaveBeenCalled();
  });

  it("mock plan は extractMock を返し extractReal を呼ばない", async () => {
    const deps = makeDeps({
      appEnv: "development",
      extractorMode: "mock",
      openAiApiKey: undefined,
    });
    expect(await extractReceiptFields(deps, { imageDataUrl: VALID })).toBe("mock");
    expect(deps.extractReal).not.toHaveBeenCalled();
  });

  it("real plan は apiKey・categories を渡す", async () => {
    const deps = makeDeps({ appEnv: "production", extractorMode: "real", openAiApiKey: "sk" });
    const categories = [{ name: "食費", description: "d" }];
    expect(
      await extractReceiptFields(deps, { imageDataUrl: VALID, telemetryId: "t1", categories }),
    ).toBe("real");
    expect(deps.extractReal).toHaveBeenCalledWith({
      imageDataUrl: VALID,
      apiKey: "sk",
      telemetryId: "t1",
      categories,
    });
  });

  it("環境は呼出ごとに読み直す", async () => {
    const deps = makeDeps({
      appEnv: "development",
      extractorMode: "mock",
      openAiApiKey: undefined,
    });
    await extractReceiptFields(deps, { imageDataUrl: VALID });
    await extractReceiptFields(deps, { imageDataUrl: VALID });
    expect(deps.readEnvironment).toHaveBeenCalledTimes(2);
  });
});
