import {
  AMOUNT_BASES,
  ROUNDING_METHODS,
  TAX_MODES,
  TAX_RATE_PERCENTS,
  type AmountBasis,
  type RoundingMethod,
  type TaxMode,
  type TaxRatePercent,
} from "./tax/types";
import {
  AI_EXPENSE_DRAFT_DOCUMENT_TYPES,
  type AiExpenseDraftDocumentType,
} from "../aiExpenseDrafts/constants";
import type {
  ExtractionConfidence,
  ReceiptItemTaxRatePercent,
} from "../receiptImageExtraction/extractionResult";

export function parseTaxRatePercent(value: unknown, field: string): TaxRatePercent {
  if ((TAX_RATE_PERCENTS as readonly unknown[]).includes(value)) return value as TaxRatePercent;
  throw new Error(`OpenAI レスポンスの ${field} は 0, 8, 10 のいずれかである必要があります`);
}

export function parseItemTaxRatePercent(value: unknown, field: string): ReceiptItemTaxRatePercent {
  if (value === null) return null;
  return parseTaxRatePercent(value, field);
}

export function parseAmountBasis(value: unknown, field: string): AmountBasis {
  if ((AMOUNT_BASES as readonly unknown[]).includes(value)) return value as AmountBasis;
  throw new Error(`OpenAI レスポンスの ${field} が不正です`);
}

export function parseTaxMode(value: unknown, field: string): TaxMode {
  if ((TAX_MODES as readonly unknown[]).includes(value)) return value as TaxMode;
  throw new Error(`OpenAI レスポンスの ${field} が不正です`);
}

export function parseRoundingMethod(value: unknown, field: string): RoundingMethod {
  if ((ROUNDING_METHODS as readonly unknown[]).includes(value)) return value as RoundingMethod;
  throw new Error(`OpenAI レスポンスの ${field} が不正です`);
}

export function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`OpenAI レスポンスの ${field} は0以上の整数である必要があります`);
  }
  return value;
}

export function parseOptionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return parseNonNegativeInteger(value, field);
}

export function parseOptionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`OpenAI レスポンスの ${field} は整数である必要があります`);
  }
  return value;
}

export function parseSignedItemInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`OpenAI レスポンスの ${field} は整数である必要があります`);
  }
  return value;
}

export function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`OpenAI レスポンスの ${fieldName} が文字列ではありません`);
  }
  return value;
}

export function parseOptionalDocumentType(value: unknown): AiExpenseDraftDocumentType {
  if (value === undefined || value === null) {
    return "unknown";
  }
  if (!(AI_EXPENSE_DRAFT_DOCUMENT_TYPES as readonly unknown[]).includes(value)) {
    throw new Error(
      'OpenAI レスポンスの documentType は "receipt", "convenience_payment", "unknown" のいずれかである必要があります',
    );
  }
  return value as AiExpenseDraftDocumentType;
}

export function parseConfidence(value: unknown): ExtractionConfidence {
  if (typeof value !== "object" || value === null) {
    throw new Error("OpenAI レスポンスの confidence がオブジェクトではありません");
  }
  const confidence = value as Record<string, unknown>;
  const shopName = parseConfidenceScore(confidence.shopName, "shopName");
  const date = parseConfidenceScore(confidence.date, "date");
  const amountYen = parseConfidenceScore(confidence.amountYen, "amountYen");
  return {
    shopName,
    date,
    amountYen,
    documentType: parseOptionalConfidenceScore(confidence.documentType, "documentType"),
    paymentPlace: parseOptionalConfidenceScore(confidence.paymentPlace, "paymentPlace"),
    payeeName: parseOptionalConfidenceScore(confidence.payeeName, "payeeName"),
    paymentPurpose: parseOptionalConfidenceScore(confidence.paymentPurpose, "paymentPurpose"),
    categoryName: parseOptionalConfidenceScore(confidence.categoryName, "categoryName"),
  };
}

export function parseConfidenceScore(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new Error(
      `OpenAI レスポンスの confidence.${fieldName} は 0.0〜1.0 の数値である必要があります`,
    );
  }
  return value;
}

export function parseOptionalConfidenceScore(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new Error(
      `OpenAI レスポンスの confidence.${fieldName} は 0.0〜1.0 の数値である必要があります`,
    );
  }
  return value;
}
