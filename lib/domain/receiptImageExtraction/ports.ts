/**
 * レシート画像抽出ユースケースが依存するポート。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { ExtractionEnvironment } from "./rules";

export type ReceiptCategoryHint = {
  name: string;
  description?: string;
};

export type ExtractReceiptFieldsInput = {
  imageDataUrl: string;
  telemetryId?: string;
  categories?: ReceiptCategoryHint[];
  /** @deprecated Use categories so descriptions reach the extractor. */
  categoryNames?: string[];
};

/** 抽出結果の型は infra の OpenAI schema 由来のため、ここでは総称型で扱う。 */
export interface ReceiptExtractorDeps<TResult> {
  readEnvironment(): ExtractionEnvironment;
  extractMock(): TResult;
  extractReal(args: ExtractReceiptFieldsInput & { apiKey: string }): Promise<TResult>;
}

/** 公開 action が必要とするグループ・同意・カテゴリの読み取りポート。 */
export interface ReceiptExtractionContextReader<TGroup> {
  getMyGroup(): Promise<TGroup | null>;
  getReceiptImageConsent(): Promise<{ hasAcceptedExternalApiConsent: boolean }>;
  listActiveCategories(): Promise<ReceiptCategoryHint[]>;
}
