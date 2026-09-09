import type { CategoryLike } from "../categories/candidate";
import type {
  AmountBasis,
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  ReceiptTaxInput,
  TaxRatePercent,
  TaxResolutionSource,
} from "../receipt/tax/types";
import type { ExtractReceiptFieldsResult } from "../../convex/receiptImageExtraction/types";
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type {
  ReceiptLineClassification,
  ReceiptRawObservationLine,
  ReceiptStructuralLineRole,
} from "../receipt/observations";
import { classifyReceiptLines } from "../receipt/lineClassification";
import {
  prepareReceiptItemEvidence,
  receiptItemMatchName,
  withoutReceiptAmount,
} from "./receiptItemEvidence";
import { buildCategoryCandidates, resolveCategoryIdFromCandidates } from "../categories/candidate";
import {
  deriveTaxReviewReasons,
  interpretedItemToDraftFields,
} from "../receipt/tax/draftTaxMapping";
import { interpretReceiptTax } from "../receipt/tax/interpretReceiptTax";
import { interpretReceiptTaxDecision } from "../receipt/tax/interpretReceiptTaxDecision";
import { resolveReceiptTotal } from "../receipt/tax/resolveReceiptTotal";
import { deriveTaxSummariesFromObservations } from "../receipt/tax/taxSummariesFromObservations";
import type {
  AiExpenseDraftConfidence,
  AiExpenseDraftDocumentType,
  AiExpenseDraftReviewReason,
} from "./constants";

export type DraftItem<TId = string> = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen?: number;
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  categoryId?: TId;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type DraftArgs<TId = string> = {
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  rawObservationLines?: ReceiptRawObservationLine[];
  receiptLineClassifications?: ReceiptLineClassification[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: TId;
  imageFileName?: string;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  reviewReasons?: AiExpenseDraftReviewReason[];
  items?: DraftItem<TId>[];
};

const STRUCTURAL_NON_ITEM_ROLES = new Set<ReceiptStructuralLineRole>([
  "tax",
  "subtotal",
  "totalCandidate",
  "paymentMethodAmount",
  "cashReceived",
  "change",
  "unknown",
]);

function receiptTaxAmounts(taxSummaries: ExtractedTaxSummary[]) {
  return [
    ...taxSummaries.flatMap((summary) => [
      summary.taxYen,
      summary.taxableAmountYen,
      ...(summary.taxIncludedAmountYen === undefined ? [] : [summary.taxIncludedAmountYen]),
    ]),
    taxSummaries.reduce((sum, summary) => sum + summary.taxYen, 0),
  ];
}

function classificationForExtractedItem(
  item: NonNullable<ExtractReceiptFieldsResult["items"]>[number],
  rawLines: ReceiptRawObservationLine[],
  classifications: ReceiptLineClassification[],
  excludedSourceLineIndexes: ReadonlySet<number> = new Set(),
) {
  const itemText = receiptItemMatchName(item.itemName);
  const printedAmountYen = item.printedAmountYen ?? item.amountYen;
  const candidates = classifications.flatMap((classification) => {
    if (excludedSourceLineIndexes.has(classification.sourceLineIndex)) return [];
    const line = rawLines.find(
      (candidate) => candidate.sourceLineIndex === classification.sourceLineIndex,
    );
    if (!line) return [];
    const text = withoutReceiptAmount(line);
    const lineText = receiptItemMatchName(text);
    const textMatches =
      itemText.length > 0 &&
      lineText.length > 0 &&
      (lineText.includes(itemText) || itemText.includes(lineText));
    return textMatches
      ? [
          {
            classification,
            amountMatches: line.amountYen === printedAmountYen,
            exactTextMatch: lineText === itemText,
          },
        ]
      : [];
  });
  const exactCandidates = candidates.filter((candidate) => candidate.exactTextMatch);
  const selectableCandidates = exactCandidates.length > 0 ? exactCandidates : candidates;
  if (exactCandidates.length === 0 && selectableCandidates.length > 1) {
    return { classification: undefined, ambiguousPartialMatch: true };
  }
  return {
    classification: selectableCandidates.sort(
      (left, right) => Number(right.amountMatches) - Number(left.amountMatches),
    )[0]?.classification,
    ambiguousPartialMatch: false,
  };
}

function isNonMonetaryPromotion(
  item: NonNullable<ExtractReceiptFieldsResult["items"]>[number],
): boolean {
  const amount = item.printedAmountYen ?? item.amountYen;
  return (
    amount === 0 &&
    /(?:ポイント.*(?:倍|発行|付与|特典)|会員.*特典)/.test(item.itemName.normalize("NFKC"))
  );
}

function normalizeExtractedItemForTax(
  item: NonNullable<ExtractReceiptFieldsResult["items"]>[number],
): ExtractedReceiptItem {
  return {
    itemName: item.itemName,
    printedAmountYen: item.printedAmountYen ?? item.amountYen,
    taxRatePercent: item.taxRatePercent ?? null,
    amountBasis: item.amountBasis ?? "unknown",
    markers: item.markers ?? (item.taxMarker ? [item.taxMarker] : []),
    taxMarker: item.taxMarker,
    categoryName: item.categoryName,
    quantity: item.quantity,
    unitPriceYen: item.unitPriceYen,
    warnings: item.warnings,
  };
}

export function mapExtractionToDraftArgs<TId>(
  extracted: ExtractReceiptFieldsResult,
  categories: CategoryLike<TId>[],
  imageFileName?: string,
): DraftArgs<TId> {
  const rawObservationLines = extracted.rawObservations ?? [];
  const extractedTaxSummaries = (extracted.taxSummaries ?? []) as ExtractedTaxSummary[];
  // Preserve supplied summaries (including conflicts); recover only missing rates.
  const taxSummaries = [
    ...extractedTaxSummaries,
    ...deriveTaxSummariesFromObservations(rawObservationLines, extracted.amountYen).filter(
      (summary) =>
        !extractedTaxSummaries.some(
          (existing) => existing.taxRatePercent === summary.taxRatePercent,
        ),
    ),
  ];
  const evidence = prepareReceiptItemEvidence(extracted.items ?? [], rawObservationLines);
  const receiptLineClassifications = classifyReceiptLines(evidence.lines, {
    receiptTotalYen: extracted.amountYen,
    taxAmountsYen: receiptTaxAmounts(taxSummaries),
  });
  const ambiguousExtractedItemIndexes: number[] = [];
  const consumedRawLineIndexes = new Set<number>();
  const matchedRawLineIndexByItem = new Map<
    NonNullable<ExtractReceiptFieldsResult["items"]>[number],
    number
  >();
  const extractedItems = evidence.items.filter((item, index) => {
    if (isNonMonetaryPromotion(item)) return false;
    const rawMatch = classificationForExtractedItem(
      item,
      evidence.lines,
      receiptLineClassifications,
      consumedRawLineIndexes,
    );
    const fromRaw = rawMatch.classification;
    if (rawMatch.ambiguousPartialMatch) ambiguousExtractedItemIndexes.push(index);
    const [fallback] = classifyReceiptLines(
      [
        {
          rawText: item.itemName,
          amountText: String(item.printedAmountYen ?? item.amountYen),
          amountYen: item.printedAmountYen ?? item.amountYen,
          lineRoleCandidates: ["item"],
          roleConfidence: item.confidence.itemName ?? 0.5,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
        },
      ],
      { taxAmountsYen: receiptTaxAmounts(taxSummaries) },
    );
    const classification = fromRaw ?? fallback;
    if (fromRaw) matchedRawLineIndexByItem.set(item, fromRaw.sourceLineIndex);
    if (fromRaw) {
      consumedRawLineIndexes.add(fromRaw.sourceLineIndex);
      const rawAmount = evidence.lines.find(
        (line) => line.sourceLineIndex === fromRaw.sourceLineIndex,
      )?.amountYen;
      if (
        rawAmount !== undefined &&
        rawAmount !== null &&
        rawAmount !== (item.printedAmountYen ?? item.amountYen)
      ) {
        ambiguousExtractedItemIndexes.push(index);
      }
    }
    if (classification?.status === "ambiguous") {
      ambiguousExtractedItemIndexes.push(index);
      return true;
    }
    const role = classification?.candidates[0]?.role ?? "unknown";
    return !STRUCTURAL_NON_ITEM_ROLES.has(role);
  });
  const recoveredRawItems: Array<{
    item: NonNullable<ExtractReceiptFieldsResult["items"]>[number];
    sourceLineIndex: number;
  }> = receiptLineClassifications.flatMap((classification) => {
    if (
      classification.status !== "classified" ||
      consumedRawLineIndexes.has(classification.sourceLineIndex) ||
      !["item", "fee"].includes(classification.candidates[0]?.role ?? "")
    ) {
      return [];
    }
    const line = evidence.lines.find(
      (candidate) => candidate.sourceLineIndex === classification.sourceLineIndex,
    );
    if (!line || !line.explicitlyPrinted || line.amountYen === null || line.amountYen <= 0) {
      return [];
    }
    const itemName = withoutReceiptAmount(line);
    if (!itemName) return [];
    return [
      {
        sourceLineIndex: line.sourceLineIndex,
        item: {
          itemName,
          lineType: "item" as const,
          amountYen: line.amountYen,
          printedAmountYen: line.amountYen,
          amountBasis: "unknown" as const,
          taxRatePercent: null,
          markers: [],
          categoryName: "",
          confidence: {
            itemName: line.roleConfidence,
            amountYen: line.roleConfidence,
            printedAmountYen: line.roleConfidence,
          },
          warnings: ["item_recovered_from_raw_observation"],
        },
      },
    ];
  });
  const markerDefinitions = [...(extracted.markerDefinitions ?? [])];
  for (const line of rawObservationLines) {
    const match = line.rawText
      .normalize("NFKC")
      .match(/^\s*([※*◎軽])(?:印)?(?:は|:|：).*?(?:8\s*%|軽減税率)/);
    if (match && !markerDefinitions.some((definition) => definition.marker === match[1])) {
      markerDefinitions.push({ marker: match[1], description: line.rawText.normalize("NFKC") });
    }
  }
  const effectiveItems = [
    ...(extractedItems ?? []).map((item) => ({
      item,
      sourceLineIndex: matchedRawLineIndexByItem.get(item) ?? Number.MAX_SAFE_INTEGER,
    })),
    ...recoveredRawItems,
  ]
    .sort((left, right) => left.sourceLineIndex - right.sourceLineIndex)
    .map(({ item, sourceLineIndex }) => {
      const raw = evidence.lines
        .find((line) => line.sourceLineIndex === sourceLineIndex)
        ?.rawText.normalize("NFKC");
      const printedMarkers = markerDefinitions
        .filter(
          (definition) =>
            raw &&
            (definition.marker === "軽"
              ? /(?:^|\s)軽[※*]?\s*[¥￥]/.test(raw)
              : raw.trimStart().startsWith(definition.marker)),
        )
        .map((definition) => definition.marker);
      return { ...item, markers: [...new Set([...(item.markers ?? []), ...printedMarkers])] };
    });

  const candidates = buildCategoryCandidates({
    documentType: extracted.documentType,
    categoryName: extracted.categoryName,
    shopName: extracted.shopName || undefined,
    payeeName: extracted.payeeName || undefined,
    paymentPurpose: extracted.paymentPurpose || undefined,
    categories,
  });
  const categoryId = resolveCategoryIdFromCandidates(extracted.categoryName, candidates);

  const taxInput: ReceiptTaxInput | undefined =
    extracted.amountYen !== null
      ? {
          amountYen: extracted.amountYen,
          receiptTotalSource: "explicit_label",
          receiptTotalConfidence: extracted.confidence.amountYen,
          items: effectiveItems.map(normalizeExtractedItemForTax),
          taxSummaries,
          markerDefinitions,
          rawObservationLines,
          receiptLineClassifications,
        }
      : undefined;

  const interpretation =
    taxInput && taxInput.items.length > 0 ? interpretReceiptTax(taxInput) : undefined;
  const receiptTaxDecision = taxInput
    ? (interpretation?.decision ?? interpretReceiptTaxDecision(taxInput))
    : undefined;
  const receiptTotalResolution =
    interpretation?.receiptTotalResolution ??
    resolveReceiptTotal({
      amountYen: extracted.amountYen,
      source: "explicit_label",
      confidence: extracted.confidence.amountYen,
      taxSummaries,
    });

  const items = effectiveItems.map((item, index) => {
    const normalized = interpretation?.items[index];
    const itemCandidates = buildCategoryCandidates({
      documentType: extracted.documentType,
      categoryName: item.categoryName,
      shopName: item.itemName,
      categories,
    });
    const itemCategoryId = resolveCategoryIdFromCandidates(item.categoryName, itemCandidates);
    const taxFields = normalized ? interpretedItemToDraftFields(normalized) : undefined;

    return {
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: normalized?.normalizedAmountYen ?? item.amountYen,
      printedAmountYen: taxFields?.printedAmountYen ?? item.printedAmountYen,
      amountBasis: taxFields?.amountBasis ?? item.amountBasis,
      taxRatePercent:
        taxFields?.taxResolutionStatus === "unresolved"
          ? null
          : taxFields !== undefined
            ? (taxFields.taxRatePercent ?? null)
            : item.taxRatePercent,
      markers: normalized?.markers ?? item.markers,
      taxMarker: normalized?.taxMarker ?? item.taxMarker,
      allocatedTaxYen: taxFields?.allocatedTaxYen,
      taxAllocationStatus: taxFields?.taxAllocationStatus,
      normalizedAmountYen: taxFields?.normalizedAmountYen,
      taxResolutionStatus: taxFields?.taxResolutionStatus,
      taxResolutionSource: taxFields?.taxResolutionSource,
      taxReviewReasons: taxFields?.taxReviewReasons,
      quantity: normalized?.quantity ?? item.quantity,
      unitPriceYen: normalized?.unitPriceYen ?? item.unitPriceYen,
      categoryName: item.categoryName || undefined,
      categoryId: itemCategoryId,
      confidence: {
        itemName: item.confidence.itemName,
        amountYen: item.confidence.amountYen,
        categoryName: item.confidence.categoryName,
        categoryId: item.confidence.categoryName,
      },
      warnings: taxFields?.warnings ?? item.warnings,
    };
  });

  const taxReviewReasons = deriveTaxReviewReasons(interpretation);
  const ambiguousStructuralLines = receiptLineClassifications.filter(
    (classification) =>
      classification.status === "ambiguous" &&
      rawObservationLines.some(
        (line) =>
          line.sourceLineIndex === classification.sourceLineIndex && line.amountYen !== null,
      ),
  );
  const reviewReasons = [
    ...taxReviewReasons,
    ...(ambiguousStructuralLines.length > 0 ||
    ambiguousExtractedItemIndexes.length > 0 ||
    effectiveItems.some(
      (item) =>
        (item.printedAmountYen ?? item.amountYen) < 0 &&
        (item.lineType === "unknown" || item.lineType === "item"),
    )
      ? (["user_confirmation_required"] as const)
      : []),
  ];

  return {
    documentType: extracted.documentType,
    shopName: extracted.shopName || undefined,
    paymentPlace: extracted.paymentPlace || undefined,
    payeeName: extracted.payeeName || undefined,
    paymentPurpose: extracted.paymentPurpose || undefined,
    date: extracted.date || undefined,
    amountYen:
      extracted.amountYen !== null && extracted.amountYen > 0 ? extracted.amountYen : undefined,
    taxSummaries: interpretation?.taxSummaries ?? taxSummaries,
    receiptTotalResolution,
    receiptTaxDecision,
    rawObservationLines: extracted.rawObservations,
    receiptLineClassifications,
    markerDefinitions,
    categoryId,
    imageFileName,
    confidence: {
      documentType: extracted.confidence.documentType,
      shopName: extracted.confidence.shopName,
      paymentPlace: extracted.confidence.paymentPlace,
      payeeName: extracted.confidence.payeeName,
      paymentPurpose: extracted.confidence.paymentPurpose,
      date: extracted.confidence.date,
      amountYen: extracted.confidence.amountYen,
      categoryId: extracted.confidence.categoryName,
    },
    warnings: [
      ...new Set([
        ...extracted.warnings,
        ...(interpretation?.warnings ?? []),
        ...ambiguousStructuralLines.map(
          (classification) => `ambiguous_receipt_line:${classification.sourceLineIndex}`,
        ),
        ...ambiguousExtractedItemIndexes.map((index) => `ambiguous_extracted_item:${index}`),
      ]),
    ],
    reviewReasons: reviewReasons.length > 0 ? [...new Set(reviewReasons)] : undefined,
    items,
  };
}
