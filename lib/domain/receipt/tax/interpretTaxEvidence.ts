import type {
  AmountBasis,
  ExtractedReceiptItem,
  PriceTaxTreatment,
  ReceiptTaxDecisionSource,
  ReceiptTaxInput,
  TaxRateComposition,
  TaxRatePercent,
} from "./types";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";
import { canonicalTaxSummaryStatus } from "./taxSummaryConsistency";

export type AxisEvidence<TValue> = {
  value: TValue;
  source: ReceiptTaxDecisionSource;
  evidence: string[];
};

export const SOURCE_PRIORITY: ReceiptTaxDecisionSource[] = [
  "user",
  "explicitLabel",
  "marker",
  "position",
  "reconciliation",
  "ai",
];

export const BUSINESS_ATTRIBUTE_PATTERN =
  /(?:免税事業者|適格請求書発行事業者ではない|インボイス(?:未登録|非登録)|登録番号なし)/;
export const INCLUDED_LABEL_PATTERN = /(?:税込|内税|税を含む)/;
export const EXCLUDED_LABEL_PATTERN = /(?:税抜|外税|税別)/;
export const TAX_AMOUNT_LABEL_PATTERN = /(?:消費税(?!\s*率)(?:額|計)?|税額|内税額|外税額|税合計)/;
export const EXCLUDED_STRUCTURAL_ROLES = new Set([
  "itemDiscount",
  "receiptDiscount",
  "coupon",
  "pointsUsed",
  "fee",
  "paymentMethodAmount",
  "cashReceived",
  "change",
]);
export const EXCLUDED_RAW_ROLES = new Set(["discount", "payment", "change"]);

export function hasExcludedClassificationRole(classification: ReceiptLineClassification) {
  const candidates =
    classification.status === "ambiguous"
      ? classification.candidates
      : classification.candidates.slice(0, 1);
  return candidates.some((candidate) => EXCLUDED_STRUCTURAL_ROLES.has(candidate.role));
}

export function isNonTaxEvidenceLine(
  line: ReceiptRawObservationLine,
  classification: ReceiptLineClassification | undefined,
) {
  const classifiedRole = classification?.candidates[0]?.role;
  if (classification?.status === "ambiguous") {
    return (
      line.lineRoleCandidates.some((role) => EXCLUDED_RAW_ROLES.has(role)) ||
      hasExcludedClassificationRole(classification)
    );
  }
  return classifiedRole === undefined
    ? line.lineRoleCandidates.some((role) => EXCLUDED_RAW_ROLES.has(role))
    : EXCLUDED_STRUCTURAL_ROLES.has(classifiedRole);
}

export function sourceRank(source: ReceiptTaxDecisionSource) {
  return SOURCE_PRIORITY.indexOf(source);
}

export function knownBases(items: ExtractedReceiptItem[]) {
  return new Set<AmountBasis>(items.map((item) => item.amountBasis));
}

export function treatmentFromBases(bases: Set<AmountBasis>): PriceTaxTreatment {
  if (bases.has("unknown")) return "unknown";
  const included = bases.has("tax_included");
  const excluded = bases.has("tax_excluded");
  if (included && excluded) return "perItem";
  if (included) return "included";
  if (excluded) return "excluded";
  return "unknown";
}

export function compositionFromRates(rates: Iterable<TaxRatePercent | null>): TaxRateComposition {
  const known = new Set([...rates].filter((rate): rate is 8 | 10 => rate === 8 || rate === 10));
  if (known.has(8) && known.has(10)) return "mixed";
  if (known.has(8)) return "rate8";
  if (known.has(10)) return "rate10";
  return "unknown";
}

export function explicitLabelEvidence(input: ReceiptTaxInput) {
  const classificationByIndex = new Map(
    (input.receiptLineClassifications ?? []).map((classification) => [
      classification.sourceLineIndex,
      classification,
    ]),
  );
  const usableLines = (input.rawObservationLines ?? []).filter((line) => {
    if (BUSINESS_ATTRIBUTE_PATTERN.test(line.rawText)) return false;
    return !isNonTaxEvidenceLine(line, classificationByIndex.get(line.sourceLineIndex));
  });
  const text = usableLines.map((line) => line.rawText.normalize("NFKC")).join("\n");
  const included = INCLUDED_LABEL_PATTERN.test(text);
  const excluded = EXCLUDED_LABEL_PATTERN.test(text);
  const treatment: PriceTaxTreatment =
    included && excluded ? "perItem" : included ? "included" : excluded ? "excluded" : "unknown";
  const rates = usableLines.flatMap((line) => {
    const normalized = line.rawText.normalize("NFKC");
    return [8, 10].filter((rate): rate is 8 | 10 =>
      new RegExp(`(?:^|\\D)${rate}\\s*%`).test(normalized),
    );
  });
  return {
    treatment,
    composition: compositionFromRates(rates),
    evidence: [
      ...(included ? ["explicit_label:included"] : []),
      ...(excluded ? ["explicit_label:excluded"] : []),
      ...[...new Set(rates)].map((rate) => `explicit_label:rate_${rate}`),
    ],
  };
}

export function markerEvidence(
  input: ReceiptTaxInput,
): AxisEvidence<TaxRateComposition> | undefined {
  const rates = (input.markerDefinitions ?? []).flatMap((definition) => {
    const normalized = definition.description.normalize("NFKC");
    return [8, 10].filter((rate): rate is 8 | 10 =>
      new RegExp(`(?:^|\\D)${rate}\\s*%`).test(normalized),
    );
  });
  const value = compositionFromRates(rates);
  return value === "unknown"
    ? undefined
    : {
        value,
        source: "marker",
        evidence: [...new Set(rates)].map((rate) => `marker_legend:rate_${rate}`),
      };
}

export function positionEvidence(input: ReceiptTaxInput) {
  const rawLineByIndex = new Map(
    (input.rawObservationLines ?? []).map((line) => [line.sourceLineIndex, line]),
  );
  const contextualRates = (input.receiptLineClassifications ?? []).flatMap((classification) => {
    if (
      classification.candidates[0]?.role !== "tax" ||
      !classification.candidates[0].evidence.includes("position:receipt_footer")
    ) {
      return [];
    }
    const text =
      rawLineByIndex.get(classification.sourceLineIndex)?.rawText.normalize("NFKC") ?? "";
    return [
      ...(/軽減(?:税率|税)/.test(text) ? ([8] as const) : []),
      ...(/標準(?:税率|税)/.test(text) ? ([10] as const) : []),
    ];
  });
  const composition = compositionFromRates(contextualRates);
  if (composition === "unknown") return undefined;
  return {
    treatment: "unknown" as const,
    composition,
    evidence: ["position:receipt_footer_tax_rate_context"],
  };
}

export function aiAxisEvidence(input: ReceiptTaxInput) {
  const treatment = treatmentFromBases(knownBases(input.items));
  const composition = compositionFromRates([
    ...input.items.map((item) => item.taxRatePercent),
    ...input.taxSummaries.map((summary) => summary.taxRatePercent),
  ]);
  return {
    treatment,
    composition,
    evidence: [
      ...(treatment === "unknown" ? [] : [`ai:treatment_${treatment}`]),
      ...(composition === "unknown" ? [] : [`ai:composition_${composition}`]),
    ],
  };
}

export function reconciliationAxisEvidence(input: ReceiptTaxInput) {
  const summariesAreVerified =
    input.taxSummaries.length > 0 &&
    input.taxSummaries.every((summary) => canonicalTaxSummaryStatus(summary.status) === "verified");
  const summaryTotal = input.taxSummaries.reduce((sum, summary) => {
    if (summary.taxableAmountBasis === "tax_included") return sum + summary.taxableAmountYen;
    if (summary.taxableAmountBasis === "tax_excluded") {
      return sum + summary.taxableAmountYen + summary.taxYen;
    }
    return Number.NaN;
  }, 0);
  const itemTreatment = treatmentFromBases(knownBases(input.items));
  const summaryTreatment = treatmentFromBases(
    new Set(input.taxSummaries.map((summary) => summary.taxableAmountBasis)),
  );
  const itemPrintedTotal = input.items.reduce((sum, item) => sum + item.printedAmountYen, 0);
  const itemTotal =
    itemTreatment === "included"
      ? itemPrintedTotal
      : itemTreatment === "excluded"
        ? itemPrintedTotal + input.taxSummaries.reduce((sum, summary) => sum + summary.taxYen, 0)
        : Number.NaN;
  const isFullyReconciled =
    summariesAreVerified &&
    Number.isFinite(summaryTotal) &&
    summaryTotal === input.amountYen &&
    input.items.length > 0 &&
    itemTreatment === summaryTreatment &&
    itemTotal === input.amountYen;
  if (!isFullyReconciled) {
    return {
      treatment: "unknown" as const,
      composition: "unknown" as const,
      evidence: [],
      mismatch:
        summariesAreVerified &&
        ((Number.isFinite(summaryTotal) && summaryTotal !== input.amountYen) ||
          (input.items.length > 0 && Number.isFinite(itemTotal) && itemTotal !== input.amountYen) ||
          (input.items.length > 0 &&
            itemTreatment !== "unknown" &&
            summaryTreatment !== "unknown" &&
            itemTreatment !== summaryTreatment)),
    };
  }
  const treatment = summaryTreatment;
  const composition = compositionFromRates(
    input.taxSummaries.map((summary) => summary.taxRatePercent),
  );
  return {
    treatment,
    composition,
    evidence: [
      ...(treatment === "unknown" ? [] : [`reconciliation:treatment_${treatment}`]),
      ...(composition === "unknown" ? [] : [`reconciliation:composition_${composition}`]),
    ],
    mismatch: false,
  };
}

export function arithmeticTreatment(input: ReceiptTaxInput): PriceTaxTreatment {
  const itemBases = knownBases(input.items);
  if (itemBases.has("unknown") && itemBases.size > 1) return "unknown";
  const modes = new Set<PriceTaxTreatment>();
  for (const summary of input.taxSummaries) {
    if (summary.taxableAmountYen === input.amountYen) modes.add("included");
    if (summary.taxableAmountYen + summary.taxYen === input.amountYen) modes.add("excluded");
  }
  if (modes.size !== 1) return "unknown";
  return [...modes][0]!;
}
