import { EXPENSE_ENTRY_AMOUNT_MAX } from "../expenseEntries/expenseEntryItem";
import {
  isDiscountItemName,
  RECEIPT_ITEM_LINE_TYPES,
  type ReceiptItemLineType,
} from "./discountItems";
import {
  validateExtractedIsoDate,
  validateReceiptShopName,
  validateReceiptTotalAmount,
} from "./receiptExtraction";
import { normalizeReceiptDate } from "./receiptDate";
import type {
  ExtractedFields,
  ExtractedReceiptTaxSummary,
  ExtractReceiptItemResult,
} from "../receiptImageExtraction/extractionResult";
import type { ReceiptMarkerDefinition } from "./tax/types";
import { RECEIPT_LINE_ROLES, type ReceiptRawObservationLine } from "./observations";
import {
  parseTaxRatePercent,
  parseItemTaxRatePercent,
  parseAmountBasis,
  parseTaxMode,
  parseRoundingMethod,
  parseNonNegativeInteger,
  parseOptionalNonNegativeInteger,
  parseOptionalInteger,
  parseSignedItemInteger,
  parseOptionalString,
  parseOptionalDocumentType,
  parseConfidence,
  parseOptionalConfidenceScore,
} from "./extractionValueParsers";
export { JAPAN_TIME_ZONE } from "../common/date";
export const MAX_EXTRACTED_LINE_ITEMS = 100;

export type ParseExtractionPayloadResult =
  | { success: true; extracted: ExtractedFields }
  | { success: false; error: string };

/** provider 応答から取り出した抽出 payload を検証し、業務用の抽出結果へ正規化する */
export function parseExtractionPayload(payload: unknown): ParseExtractionPayloadResult {
  try {
    if (typeof payload !== "object" || payload === null) {
      throw new Error("OpenAI レスポンスが期待する形式ではありません");
    }
    const obj = payload as Record<string, unknown>;

    if (typeof obj.shopName !== "string") {
      throw new Error("OpenAI レスポンスの shopName が文字列ではありません");
    }
    const shopNameResult = validateReceiptShopName(obj.shopName);
    if (!shopNameResult.success) {
      throw new Error("OpenAI レスポンスの shopName が空または長すぎます");
    }
    if (typeof obj.date !== "string") {
      throw new Error("OpenAI レスポンスの date が文字列ではありません");
    }
    if (typeof obj.amountYen !== "number" && obj.amountYen !== null) {
      throw new Error("OpenAI レスポンスの amountYen が数値またはnullではありません");
    }
    if (
      typeof obj.amountYen === "number" &&
      (obj.amountYen !== 0 || !Number.isInteger(obj.amountYen)) &&
      !validateReceiptTotalAmount(obj.amountYen).success
    ) {
      throw new Error(
        "OpenAI レスポンスの amountYen は 0 円以上 9,999,999 円以下の整数である必要があります",
      );
    }
    const confidence = parseConfidence(obj.confidence);

    const documentType = parseOptionalDocumentType(obj.documentType);
    const paymentPlace = parseOptionalString(obj.paymentPlace, "paymentPlace");
    const payeeName = parseOptionalString(obj.payeeName, "payeeName");
    const paymentPurpose = parseOptionalString(obj.paymentPurpose, "paymentPurpose");
    const categoryName = parseOptionalString(obj.categoryName, "categoryName");
    const items = parseOptionalItems(obj.items);
    const taxSummaries = parseOptionalTaxSummaries(obj.taxSummaries);
    const markerDefinitions = parseOptionalMarkerDefinitions(obj.markerDefinitions);
    const rawObservations = parseOptionalRawObservations(obj.rawObservations);
    const parsedDate = resolveExtractedDate(obj.date, rawObservations);

    return {
      success: true,
      extracted: {
        shopName: obj.shopName,
        date: parsedDate.date,
        amountYen: obj.amountYen,
        documentType,
        paymentPlace,
        payeeName,
        paymentPurpose,
        categoryName,
        items,
        taxSummaries,
        markerDefinitions,
        rawObservations,
        confidence,
        warnings: [
          ...(Array.isArray(obj.warnings)
            ? (obj.warnings as string[]).filter((w) => typeof w === "string")
            : []),
          ...parsedDate.warnings,
        ],
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveExtractedDate(
  date: string,
  rawObservations: ReceiptRawObservationLine[] | undefined,
): { date: string; warnings: string[] } {
  const candidates = [
    ...new Set(
      (rawObservations ?? []).flatMap((line) => {
        if (!line.explicitlyPrinted || !isPurchaseDateObservation(line.rawText)) return [];
        const result = normalizeReceiptDate(line.rawText);
        return result.success ? [result.date] : [];
      }),
    ),
  ];
  if (candidates.length === 1) {
    return {
      date: candidates[0],
      warnings: candidates[0] === date ? [] : ["date_recovered_from_raw_observations"],
    };
  }
  const validated = validateExtractedIsoDate(date);
  if (validated.success && validated.date !== "") return { date: validated.date, warnings: [] };
  const normalizedStructuredDate = normalizeReceiptDate(date);
  if (normalizedStructuredDate.success) {
    return {
      date: normalizedStructuredDate.date,
      warnings: ["date_normalized_from_structured_value"],
    };
  }
  if (date === "") return { date, warnings: [] };
  throw new Error("OpenAI レスポンスの date が妥当な YYYY-MM-DD 形式ではありません");
}

const NON_PURCHASE_DATE_CONTEXT =
  /(?:期限|有効|失効|キャンペーン|休業|定休日|返品|交換|発行|登録|入会|製造|賞味|消費)/;
const PRINTED_TIME = /(?:[01]?\d|2[0-3])\s*(?::|時)\s*[0-5]?\d(?:\s*分)?/;

/** 購入日時らしい明示時刻を伴う行だけを、構造化日付の照合根拠にする。 */
function isPurchaseDateObservation(rawText: string): boolean {
  const normalized = rawText.normalize("NFKC");
  return PRINTED_TIME.test(normalized) && !NON_PURCHASE_DATE_CONTEXT.test(normalized);
}

function parseOptionalRawObservations(value: unknown): ReceiptRawObservationLine[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("OpenAI レスポンスの rawObservations が配列ではありません");
  }
  if (value.length > MAX_EXTRACTED_LINE_ITEMS) {
    throw new Error(
      `OpenAI レスポンスの rawObservations は ${MAX_EXTRACTED_LINE_ITEMS} 件以下である必要があります`,
    );
  }
  return value.map((line, index) => parseRawObservation(line, index));
}

function parseRawObservation(value: unknown, index: number): ReceiptRawObservationLine {
  const field = `rawObservations[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`OpenAI レスポンスの ${field} がオブジェクトではありません`);
  }
  const line = value as Record<string, unknown>;
  if (typeof line.rawText !== "string" || line.rawText.length > 500) {
    throw new Error(`OpenAI レスポンスの ${field}.rawText が不正です`);
  }
  if (
    line.amountText !== null &&
    (typeof line.amountText !== "string" || line.amountText.length > 100)
  ) {
    throw new Error(`OpenAI レスポンスの ${field}.amountText が不正です`);
  }
  if (
    line.amountYen !== null &&
    (typeof line.amountYen !== "number" ||
      !Number.isInteger(line.amountYen) ||
      Math.abs(line.amountYen) > EXPENSE_ENTRY_AMOUNT_MAX)
  ) {
    throw new Error(`OpenAI レスポンスの ${field}.amountYen が不正です`);
  }
  if (
    !Array.isArray(line.lineRoleCandidates) ||
    line.lineRoleCandidates.some(
      (role) => !(RECEIPT_LINE_ROLES as readonly unknown[]).includes(role),
    )
  ) {
    throw new Error(`OpenAI レスポンスの ${field}.lineRoleCandidates が不正です`);
  }
  const roleConfidence = parseOptionalConfidenceScore(
    line.roleConfidence,
    `${field}.roleConfidence`,
  );
  if (roleConfidence === undefined) {
    throw new Error(`OpenAI レスポンスの ${field}.roleConfidence が不正です`);
  }
  if (typeof line.explicitlyPrinted !== "boolean") {
    throw new Error(`OpenAI レスポンスの ${field}.explicitlyPrinted が不正です`);
  }
  if (
    typeof line.sourceLineIndex !== "number" ||
    !Number.isInteger(line.sourceLineIndex) ||
    line.sourceLineIndex < 0
  ) {
    throw new Error(`OpenAI レスポンスの ${field}.sourceLineIndex が不正です`);
  }

  return {
    rawText: line.rawText,
    amountText: line.amountText,
    amountYen: line.amountYen,
    lineRoleCandidates: [...new Set(line.lineRoleCandidates)],
    roleConfidence,
    explicitlyPrinted: line.explicitlyPrinted,
    sourceLineIndex: line.sourceLineIndex,
    boundingBox: parseObservationBoundingBox(line.boundingBox, `${field}.boundingBox`),
  } as ReceiptRawObservationLine;
}

function parseObservationBoundingBox(
  value: unknown,
  field: string,
): ReceiptRawObservationLine["boundingBox"] {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") {
    throw new Error(`OpenAI レスポンスの ${field} が不正です`);
  }
  const box = value as Record<string, unknown>;
  const coordinates = [box.left, box.top, box.width, box.height];
  if (
    coordinates.some(
      (coordinate) => typeof coordinate !== "number" || coordinate < 0 || coordinate > 1,
    )
  ) {
    throw new Error(`OpenAI レスポンスの ${field} が不正です`);
  }
  return {
    left: box.left as number,
    top: box.top as number,
    width: box.width as number,
    height: box.height as number,
  };
}

function parseOptionalItems(value: unknown): ExtractReceiptItemResult[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("OpenAI レスポンスの items が配列ではありません");
  }
  if (value.length > MAX_EXTRACTED_LINE_ITEMS) {
    throw new Error(
      `OpenAI レスポンスの items は ${MAX_EXTRACTED_LINE_ITEMS} 件以下である必要があります`,
    );
  }
  return value.map((rawItem, index) => parseReceiptItem(rawItem, index));
}

function parseReceiptItem(value: unknown, index: number): ExtractReceiptItemResult {
  if (typeof value !== "object" || value === null) {
    throw new Error(`OpenAI レスポンスの items[${index}] がオブジェクトではありません`);
  }
  const item = value as Record<string, unknown>;
  if (typeof item.itemName !== "string") {
    throw new Error(`OpenAI レスポンスの items[${index}].itemName が文字列ではありません`);
  }
  const lineType = parseReceiptItemLineType(item.lineType, item.itemName, item.printedAmountYen);
  const printedAmountYen = parseSignedItemInteger(
    item.printedAmountYen,
    `items[${index}].printedAmountYen`,
  );
  assertExtractedAmountRange(printedAmountYen, `items[${index}].printedAmountYen`);
  const amountBasis = parseAmountBasis(item.amountBasis, `items[${index}].amountBasis`);
  const taxRatePercent = parseItemTaxRatePercent(
    item.taxRatePercent,
    `items[${index}].taxRatePercent`,
  );
  const markers = parseStringArray(item.markers, `items[${index}].markers`);
  const taxMarker = parseOptionalString(item.taxMarker, `items[${index}].taxMarker`);

  const confidence = parseItemConfidence(item.confidence, index);
  return {
    itemName: item.itemName,
    lineType,
    amountYen: printedAmountYen,
    printedAmountYen,
    amountBasis,
    taxRatePercent,
    markers: markers ?? (taxMarker ? [taxMarker] : []),
    taxMarker: taxMarker ?? markers?.[0] ?? "",
    quantity: parseOptionalInteger(item.quantity, `items[${index}].quantity`),
    unitPriceYen: parseOptionalInteger(item.unitPriceYen, `items[${index}].unitPriceYen`),
    categoryName: parseOptionalString(item.categoryName, `items[${index}].categoryName`),
    confidence,
    warnings: [
      ...(Array.isArray(item.warnings)
        ? (item.warnings as string[]).filter((warning) => typeof warning === "string")
        : []),
      ...(printedAmountYen < 0 && lineType === "unknown"
        ? ["negative_amount_line_type_uncertain"]
        : []),
      ...(printedAmountYen < 0 && lineType === "item" ? ["negative_amount_on_product_line"] : []),
    ],
  };
}

function parseReceiptItemLineType(
  value: unknown,
  itemName: string,
  printedAmountYen: unknown,
): ReceiptItemLineType {
  if (typeof value === "string" && RECEIPT_ITEM_LINE_TYPES.includes(value as ReceiptItemLineType)) {
    return value as ReceiptItemLineType;
  }
  if (value !== undefined && value !== null) {
    throw new Error("OpenAI レスポンスの items[].lineType が不正です");
  }
  if (typeof printedAmountYen === "number" && printedAmountYen < 0) {
    return isDiscountItemName(itemName) ? "discount" : "unknown";
  }
  return "item";
}

function parseOptionalMarkerDefinitions(value: unknown): ReceiptMarkerDefinition[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("OpenAI レスポンスの markerDefinitions が配列ではありません");
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`OpenAI レスポンスの markerDefinitions[${index}] が不正です`);
    }
    const definition = raw as Record<string, unknown>;
    if (typeof definition.marker !== "string" || typeof definition.description !== "string") {
      throw new Error(`OpenAI レスポンスの markerDefinitions[${index}] が不正です`);
    }
    return { marker: definition.marker, description: definition.description };
  });
}

function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`OpenAI レスポンスの ${field} が文字列配列ではありません`);
  }
  return [...new Set(value)];
}

function parseItemConfidence(
  value: unknown,
  index: number,
): ExtractReceiptItemResult["confidence"] {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object") {
    throw new Error(`OpenAI レスポンスの items[${index}].confidence がオブジェクトではありません`);
  }
  const confidence = value as Record<string, unknown>;
  return {
    itemName: parseOptionalConfidenceScore(confidence.itemName, `items[${index}].itemName`),
    // amountYen は後方互換フィールドのため、印字額の信頼度を意図的に引き継ぐ。
    amountYen: parseOptionalConfidenceScore(
      confidence.printedAmountYen,
      `items[${index}].printedAmountYen`,
    ),
    printedAmountYen: parseOptionalConfidenceScore(
      confidence.printedAmountYen,
      `items[${index}].printedAmountYen`,
    ),
    amountBasis: parseOptionalConfidenceScore(
      confidence.amountBasis,
      `items[${index}].amountBasis`,
    ),
    taxRatePercent: parseOptionalConfidenceScore(
      confidence.taxRatePercent,
      `items[${index}].taxRatePercent`,
    ),
    categoryName: parseOptionalConfidenceScore(
      confidence.categoryName,
      `items[${index}].categoryName`,
    ),
  };
}

function parseOptionalTaxSummaries(value: unknown): ExtractedReceiptTaxSummary[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("OpenAI レスポンスの taxSummaries が配列ではありません");
  }
  return value.map((summary, index) => parseTaxSummary(summary, index));
}

function parseTaxSummary(value: unknown, index: number): ExtractedReceiptTaxSummary {
  const field = `taxSummaries[${index}]`;
  if (typeof value !== "object" || value === null) {
    throw new Error(`OpenAI レスポンスの ${field} がオブジェクトではありません`);
  }
  const summary = value as Record<string, unknown>;
  const confidence = parseTaxSummaryConfidence(summary.confidence, field);
  const parsed = {
    taxRatePercent: parseTaxRatePercent(summary.taxRatePercent, `${field}.taxRatePercent`),
    taxMode: parseTaxMode(summary.taxMode, `${field}.taxMode`),
    taxableAmountYen: parseNonNegativeInteger(
      summary.taxableAmountYen,
      `${field}.taxableAmountYen`,
    ),
    taxableAmountBasis: parseAmountBasis(summary.taxableAmountBasis, `${field}.taxableAmountBasis`),
    taxYen: parseNonNegativeInteger(summary.taxYen, `${field}.taxYen`),
    taxIncludedAmountYen: parseOptionalNonNegativeInteger(
      summary.taxIncludedAmountYen,
      `${field}.taxIncludedAmountYen`,
    ),
    roundingMethod: parseRoundingMethod(summary.roundingMethod, `${field}.roundingMethod`),
    confidence,
    warnings: Array.isArray(summary.warnings)
      ? summary.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
  for (const key of ["taxableAmountYen", "taxYen", "taxIncludedAmountYen"] as const) {
    const amount = parsed[key];
    if (amount !== undefined) assertExtractedAmountRange(amount, `${field}.${key}`);
  }
  return parsed;
}

function assertExtractedAmountRange(amount: number, field: string): void {
  if (Math.abs(amount) > EXPENSE_ENTRY_AMOUNT_MAX) {
    throw new Error(
      `OpenAI レスポンスの ${field} は絶対値が ${EXPENSE_ENTRY_AMOUNT_MAX.toLocaleString("ja-JP")} 円以下である必要があります`,
    );
  }
}

function parseTaxSummaryConfidence(
  value: unknown,
  field: string,
): ExtractedReceiptTaxSummary["confidence"] {
  if (typeof value !== "object" || value === null) {
    throw new Error(`OpenAI レスポンスの ${field}.confidence がオブジェクトではありません`);
  }
  const confidence = value as Record<string, unknown>;
  return {
    taxRatePercent: parseOptionalConfidenceScore(
      confidence.taxRatePercent,
      `${field}.taxRatePercent`,
    ),
    taxMode: parseOptionalConfidenceScore(confidence.taxMode, `${field}.taxMode`),
    taxableAmountYen: parseOptionalConfidenceScore(
      confidence.taxableAmountYen,
      `${field}.taxableAmountYen`,
    ),
    taxableAmountBasis: parseOptionalConfidenceScore(
      confidence.taxableAmountBasis,
      `${field}.taxableAmountBasis`,
    ),
    taxYen: parseOptionalConfidenceScore(confidence.taxYen, `${field}.taxYen`),
  };
}
