/**
 * レシート画像抽出の adapter 固有型。
 * 業務用の抽出結果契約の正本は lib/domain/receiptImageExtraction/extractionResult.ts にある。
 * ここでは provider 応答と extractor 引数だけを所有し、業務型は domain 正本を再exportする。
 */
import type { ReceiptCategoryHint } from "../../../lib/domain/receiptImageExtraction/extractionRequest";
import { MAX_IMAGE_DATA_URL_LENGTH as _MAX_IMAGE_DATA_URL_LENGTH } from "../../../lib/domain/common/imageDataUrl";
import {
  JAPAN_TIME_ZONE as _JAPAN_TIME_ZONE,
  MAX_EXTRACTED_LINE_ITEMS as _MAX_EXTRACTED_LINE_ITEMS,
} from "../../../lib/domain/receipt/extraction";

export type {
  TaxRatePercent,
  AmountBasis,
  TaxMode,
  RoundingMethod,
} from "../../domain/receipt/tax/types";
export type { ReceiptCategoryHint } from "../../../lib/domain/receiptImageExtraction/extractionRequest";
export type { ReceiptItemLineType } from "../../../lib/domain/receipt/discountItems";
export type { ReceiptRawObservationLine } from "../../../lib/domain/receipt/observations";
export type {
  ExtractionConfidence,
  ExtractedFields,
  ExtractedReceiptTaxSummary,
  ExtractReceiptFieldsResult,
  ExtractReceiptItemResult,
  ReceiptItemTaxRatePercent,
  ReceiptMarkerDefinition,
} from "../../../lib/domain/receiptImageExtraction/extractionResult";

export type OpenAIResponsesApiResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  output: Array<{
    type: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  }>;
};

export type ExtractReceiptFieldsArgs = {
  imageDataUrl: string;
  telemetryId?: string;
  categories?: ReceiptCategoryHint[];
  /** @deprecated Use categories so descriptions reach the extractor. */
  categoryNames?: string[];
};

export type OpenAIReceiptExtractorArgs = {
  imageDataUrl: string;
  apiKey: string;
  telemetryId?: string;
  categories?: ReceiptCategoryHint[];
  /** @deprecated Use categories so descriptions reach the extractor. */
  categoryNames?: string[];
};

/** Convex string value の 1MB 制限を下回る imageDataUrl の最大長 */
export const MAX_IMAGE_DATA_URL_LENGTH = _MAX_IMAGE_DATA_URL_LENGTH;
export const MAX_EXTRACTED_LINE_ITEMS = _MAX_EXTRACTED_LINE_ITEMS;
export const JAPAN_TIME_ZONE = _JAPAN_TIME_ZONE;
