/**
 * ReceiptExtractorDeps の Convex 実装。
 * 環境変数の読み取りと mock/real extractor の合成をここに隔離する。
 */
import type { ActionCtx } from "../../../convex/_generated/server";
import { api } from "../../../convex/_generated/api";
import type {
  ReceiptExtractionContextReader,
  ReceiptExtractorDeps,
} from "../../domain/receiptImageExtraction/ports";
import { getMockResult } from "./mock";
import { callOpenAIReceiptExtractor } from "./openaiClient";
import type { ExtractReceiptFieldsResult, ReceiptCategoryHint } from "./types";

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

type MyGroup = typeof api.groups.queries.getMyGroup._returnType;

export function createReceiptExtractionContextReader(
  ctx: Pick<ActionCtx, "runQuery">,
): ReceiptExtractionContextReader<NonNullable<MyGroup>> {
  return {
    getMyGroup: () => ctx.runQuery(api.groups.queries.getMyGroup, {}),
    getReceiptImageConsent: () => ctx.runQuery(api.users.queries.getReceiptImageConsent, {}),
    async listActiveCategories() {
      const categories = await ctx.runQuery(api.categories.queries.listActive, {});
      return categories.map<ReceiptCategoryHint>((category) => ({
        name: category.name,
        description: category.description,
      }));
    },
  };
}
