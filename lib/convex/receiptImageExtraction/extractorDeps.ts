/**
 * ReceiptExtractorDeps の Convex 実装。
 * 環境変数の読み取りと mock/real extractor の合成をここに隔離する。
 */
import type { ReceiptExtractorDeps } from "../../domain/receiptImageExtraction/ports";
import { getMockResult } from "./mock";
import { callOpenAIReceiptExtractor } from "./openaiClient";
import type { ExtractReceiptFieldsResult } from "./types";

/** 環境変数は呼出時に読む（テストが process.env を差し替えるため）。 */
export function createReceiptExtractorDeps(): ReceiptExtractorDeps<ExtractReceiptFieldsResult> {
  return {
    readEnvironment: () => ({
      appEnv: process.env.APP_ENV,
      extractorMode: process.env.RECEIPT_IMAGE_EXTRACTOR_MODE,
      openAiApiKey: process.env.OPENAI_API_KEY,
    }),
    extractMock: getMockResult,
    extractReal: callOpenAIReceiptExtractor,
  };
}
