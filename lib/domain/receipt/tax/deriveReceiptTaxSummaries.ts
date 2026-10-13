import { isDiscountLine } from "../discountItems";
import { isReceiptTotalLabel } from "../lineClassification";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";
import type { ExtractedReceiptItem, ExtractedTaxSummary, TaxRatePercent } from "./types";
import {
  taxSummaryEvidenceLines,
  independentSummaryLines,
  taxSummaryLineKind,
  hasPrintedTaxSummaryEvidence,
  isTaxRateDeclarationLine,
} from "./summaryEvidence";

export const TAX_EVIDENCE_CONFLICT = "contradictory_receipt_tax_evidence";
export const TAX_EVIDENCE_MISSING = "unresolved_receipt_tax_evidence";

function isAggregateTaxLine(rawText: string): boolean {
  const text = rawText.normalize("NFKC").replace(/\s+/g, "");
  return !text.includes("%") && /税額?合計|消費税(?:額)?(?:合計|計)|taxtotal/i.test(text);
}

export function deriveReceiptTaxSummaries(args: {
  amountYen: number;
  items: ExtractedReceiptItem[];
  evidenceSummaries: ExtractedTaxSummary[];
  lines?: ReceiptRawObservationLine[];
  classifications?: ReceiptLineClassification[];
  correctedSummaries?: ExtractedTaxSummary[];
  allowEstimates?: boolean;
  preferExplicitChoice?: boolean;
}): ExtractedTaxSummary[] {
  const { items, evidenceSummaries } = args;
  if (
    items.length === 0 ||
    items.some((item) => item.taxRatePercent === null || item.amountBasis === "unknown")
  ) {
    return evidenceSummaries.filter((summary) => summary.valueOrigin?.source !== "items");
  }
  const rates = [...new Set(items.map((item) => item.taxRatePercent!))];
  const lines = independentSummaryLines(args.lines, args.classifications).filter((line) => {
    const declaredRates = [
      ...line.rawText.normalize("NFKC").matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g),
    ].map((match) => Number(match[1]));
    return !(
      line.amountYen === 0 &&
      taxSummaryLineKind(line.rawText) !== undefined &&
      declaredRates.length > 0 &&
      declaredRates.every(
        (rate) => [0, 8, 10].includes(rate) && !rates.includes(rate as TaxRatePercent),
      )
    );
  });
  const hasPrintedSummaryEvidence = hasPrintedTaxSummaryEvidence(lines, args.classifications);
  const options = { singleSummary: rates.length === 1, classifications: args.classifications };
  const taxableRates = rates.filter((rate) => rate !== 0);
  const explicitCorrections = args.correctedSummaries ?? [];
  const unidentifiedEvidence = lines.some((line) => {
    if (isTaxRateDeclarationLine(line)) return false;
    if (taxSummaryLineKind(line.rawText) === undefined) {
      return (
        !isReceiptTotalLabel(line.rawText) &&
        !/subtotal/i.test(line.rawText) &&
        (line.lineRoleCandidates.includes("tax") || line.lineRoleCandidates.includes("subtotal"))
      );
    }
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    if (!Number.isSafeInteger(line.amountYen)) return true;
    const declaredRates = [...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g)].map((match) =>
      Number(match[1]),
    );
    return (
      declaredRates.length !== (text.match(/%/g)?.length ?? 0) ||
      declaredRates.some((rate) => !rates.includes(rate as TaxRatePercent)) ||
      (taxableRates.length > 1 &&
        declaredRates.length === 0 &&
        taxSummaryLineKind(text) !== undefined &&
        !/小計|subtotal/i.test(text) &&
        !isAggregateTaxLine(text))
    );
  });
  const totalConflict = lines.some(
    (line) =>
      isReceiptTotalLabel(line.rawText) &&
      taxSummaryLineKind(line.rawText) === undefined &&
      line.amountYen !== args.amountYen,
  );
  const estimatedRates = new Set<TaxRatePercent>();
  const derived = rates.map((rate) => {
    const group = items.filter((item) => item.taxRatePercent === rate);
    const basis = group[0].amountBasis;
    const target = group.reduce((sum, item) => sum + item.printedAmountYen, 0);
    const taxLines = taxSummaryEvidenceLines(lines, rate, "tax", {
      ...options,
      singleSummary: rate === 0 ? rates.length === 1 : taxableRates.length === 1,
    });
    const taxes = [...new Set(taxLines.map((line) => line.amountYen!))];
    const correctedTaxes = [
      ...new Set(
        explicitCorrections
          .filter(
            (summary) =>
              summary.taxRatePercent === rate && summary.userEditedFields?.includes("taxYen"),
          )
          .map((summary) => summary.taxYen),
      ),
    ];
    const correctedTax = correctedTaxes.length === 1 ? correctedTaxes[0] : undefined;
    // 原文がない旧データでは、元の抽出税額だけを暫定入力とする。対象額と計算済み値は再利用しない。
    const legacyTaxes =
      !args.preferExplicitChoice && !hasPrintedSummaryEvidence
        ? [
            ...new Set(
              evidenceSummaries
                .filter(
                  (summary) =>
                    summary.taxRatePercent === rate && summary.valueOrigin?.source !== "items",
                )
                .map((summary) => summary.taxYen),
            ),
          ]
        : [];
    const roundingMethod = "unknown" as const;
    const exactTax =
      basis === "tax_included" ? (target * rate) / (100 + rate) : (target * rate) / 100;
    const validLegacyTaxes = legacyTaxes.filter((tax) =>
      [Math.floor(exactTax), Math.ceil(exactTax)].includes(tax),
    );
    const externalRates = new Set(
      items
        .filter((item) => item.amountBasis === "tax_excluded")
        .map((item) => item.taxRatePercent),
    );
    const paidTax = args.amountYen - items.reduce((sum, item) => sum + item.printedAmountYen, 0);
    const estimatedTax =
      basis === "tax_excluded" &&
      externalRates.size === 1 &&
      [Math.floor(exactTax), Math.ceil(exactTax)].includes(paidTax)
        ? paidTax
        : Math.round(exactTax);
    const tax =
      rate === 0
        ? (correctedTax ?? taxes[0] ?? 0)
        : (correctedTax ??
          taxes[0] ??
          (args.allowEstimates ? validLegacyTaxes[0] : legacyTaxes[0]) ??
          estimatedTax);
    if (
      rate !== 0 &&
      correctedTax === undefined &&
      taxes.length === 0 &&
      validLegacyTaxes.length === 0
    ) {
      estimatedRates.add(rate);
    }
    const included = target + (basis === "tax_excluded" ? tax : 0);
    const excluded = included - tax;
    const conflict =
      unidentifiedEvidence ||
      correctedTaxes.length > 1 ||
      (rate === 0 && correctedTax === undefined && taxes.some((amount) => amount !== 0)) ||
      totalConflict ||
      (correctedTax === undefined && taxes.length > 1) ||
      (correctedTax === undefined && legacyTaxes.length > 1) ||
      group.some(
        (item) => item.amountBasis !== basis || !Number.isSafeInteger(item.printedAmountYen),
      ) ||
      !Number.isSafeInteger(target) ||
      target < 0 ||
      ![Math.floor(exactTax), Math.ceil(exactTax)].includes(tax) ||
      taxLines.some((line) => {
        if (rate === 0) return false;
        const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
        return basis === "tax_included" && /外税|税抜|税別/.test(text);
      }) ||
      taxSummaryEvidenceLines(lines, rate, "target", options).some((line) => {
        const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
        if (/税抜|税別/.test(text)) return line.amountYen !== excluded;
        if (/税込/.test(text)) return line.amountYen !== included;
        if (/小計|subtotal/i.test(text) && !text.includes("%")) {
          if (rates.length > 1) return false;
          return (
            line.amountYen !== target &&
            line.amountYen !== excluded &&
            line.amountYen !== included &&
            !(
              group.some((item) => item.printedAmountYen < 0) &&
              group
                .filter((item) => item.printedAmountYen < 0)
                .every((item) => isDiscountLine(item.itemName, item.lineType)) &&
              line.amountYen ===
                group
                  .filter((item) => item.printedAmountYen >= 0)
                  .reduce((sum, item) => sum + item.printedAmountYen, 0)
            )
          );
        }
        if (
          basis === "tax_excluded" &&
          line.amountYen === included &&
          taxLines.some((taxLine) =>
            /内(?:消費)?税|税込|\(内\)税/.test(taxLine.rawText.normalize("NFKC")),
          )
        )
          return false;
        return line.amountYen !== target;
      });
    const missing =
      rate !== 0 &&
      (hasPrintedSummaryEvidence || !args.allowEstimates) &&
      taxes.length === 0 &&
      correctedTax === undefined &&
      validLegacyTaxes.length === 0;
    return {
      taxRatePercent: rate,
      taxMode: basis === "tax_included" ? "included" : "external",
      taxableAmountYen: target,
      taxableAmountBasis: basis,
      taxYen: tax,
      taxIncludedAmountYen: included,
      roundingMethod,
      ...(correctedTax === undefined ? {} : { userEditedFields: ["taxYen" as const] }),
      valueOrigin: { source: "items" },
      confidence: {},
      warnings: conflict ? [TAX_EVIDENCE_CONFLICT] : missing ? [TAX_EVIDENCE_MISSING] : [],
    } satisfies ExtractedTaxSummary;
  });
  const aggregateAmounts = [
    items.reduce((sum, item) => sum + item.printedAmountYen, 0),
    derived.reduce((sum, summary) => sum + summary.taxIncludedAmountYen!, 0),
    derived.reduce((sum, summary) => sum + summary.taxIncludedAmountYen! - summary.taxYen, 0),
  ];
  if (
    items
      .filter((item) => item.printedAmountYen < 0)
      .every((item) => isDiscountLine(item.itemName, item.lineType))
  ) {
    aggregateAmounts.push(
      items
        .filter((item) => item.printedAmountYen >= 0)
        .reduce((sum, item) => sum + item.printedAmountYen, 0),
    );
  }
  const subtotalConflict = lines.some((line) => {
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    return (
      /小計|subtotal/i.test(text) &&
      !text.includes("%") &&
      taxSummaryLineKind(text) === "target" &&
      !aggregateAmounts.includes(line.amountYen!)
    );
  });
  const aggregateTaxConflict = lines.some(
    (line) =>
      isAggregateTaxLine(line.rawText) &&
      line.amountYen !== derived.reduce((sum, summary) => sum + summary.taxYen, 0),
  );
  const estimatedTotalConflict =
    derived.reduce((sum, summary) => sum + summary.taxIncludedAmountYen!, 0) !== args.amountYen;
  return derived.map((summary) =>
    subtotalConflict ||
    aggregateTaxConflict ||
    (estimatedTotalConflict && estimatedRates.has(summary.taxRatePercent))
      ? { ...summary, warnings: [...new Set([...summary.warnings, TAX_EVIDENCE_CONFLICT])] }
      : summary,
  );
}
