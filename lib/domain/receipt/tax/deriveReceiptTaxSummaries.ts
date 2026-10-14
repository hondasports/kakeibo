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
  return (
    !text.includes("%") &&
    (/税額?合計|消費税(?:額)?(?:合計|計)|taxtotal/i.test(text) ||
      /^(?:内|外|\(内\)|\(外\))?(?:消費税(?:額)?(?:等)?|税額(?:等)?|内税(?:額)?|外税(?:額)?)(?:合計|計)?[:：]?[¥￥]?[\d,]+(?:円)?$/.test(
        text,
      ))
  );
}

export function deriveReceiptTaxSummaries(args: {
  amountYen: number;
  items: ExtractedReceiptItem[];
  lines?: ReceiptRawObservationLine[];
  classifications?: ReceiptLineClassification[];
  correctedSummaries?: ExtractedTaxSummary[];
  allowEstimates?: boolean;
  paidTotalConfirmed?: boolean;
}): ExtractedTaxSummary[] {
  const { items } = args;
  if (
    items.length === 0 ||
    items.some((item) => item.taxRatePercent === null || item.amountBasis === "unknown")
  ) {
    return [];
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
      (new Set(declaredRates).size > 1 && taxSummaryLineKind(text) !== "target") ||
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
  const buckets = rates.map((rate) => {
    const group = items.filter((item) => item.taxRatePercent === rate);
    const basis = group[0].amountBasis;
    const target = group.reduce((sum, item) => sum + item.printedAmountYen, 0);
    const evidenceOptions = {
      ...options,
      singleSummary: rate === 0 ? rates.length === 1 : taxableRates.length === 1,
      ignoreExemptRateForRateLess: rate !== 0 && rates.includes(0),
    };
    const taxLines = taxSummaryEvidenceLines(lines, rate, "tax", evidenceOptions);
    const targetLines = taxSummaryEvidenceLines(lines, rate, "target", evidenceOptions);
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
    const exactTax =
      basis === "tax_included" ? (target * rate) / (100 + rate) : (target * rate) / 100;
    return {
      rate,
      group,
      basis,
      target,
      taxLines,
      targetLines,
      taxes,
      correctedTaxes,
      correctedTax,
      exactTax,
    };
  });
  const estimatedExternal = buckets.filter(
    (bucket) =>
      bucket.rate !== 0 &&
      bucket.basis === "tax_excluded" &&
      bucket.correctedTax === undefined &&
      bucket.taxes.length === 0,
  );
  const fixedTax = buckets
    .filter((bucket) => bucket.basis === "tax_excluded" && !estimatedExternal.includes(bucket))
    .reduce((sum, bucket) => sum + (bucket.correctedTax ?? bucket.taxes[0] ?? 0), 0);
  const requiredTax =
    args.amountYen - items.reduce((sum, item) => sum + item.printedAmountYen, 0) - fixedTax;
  const combinations = estimatedExternal.reduce<number[][]>(
    (current, bucket) =>
      current.flatMap((values) =>
        [...new Set([Math.floor(bucket.exactTax), Math.ceil(bucket.exactTax)])].map((tax) => [
          ...values,
          tax,
        ]),
      ),
    [[]],
  );
  const matches = combinations.filter(
    (values) => values.reduce((sum, tax) => sum + tax, 0) === requiredTax,
  );
  const resolvedExternal = new Map<TaxRatePercent, number>(
    matches.length === 1
      ? estimatedExternal.map((bucket, index) => [bucket.rate, matches[0][index]])
      : [],
  );
  const ambiguousEstimatedTax = matches.length > 1;
  const estimatedRates = new Set<TaxRatePercent>();
  const derived = buckets.map(
    ({
      rate,
      group,
      basis,
      target,
      taxLines,
      targetLines,
      taxes,
      correctedTaxes,
      correctedTax,
      exactTax,
    }) => {
      const roundingMethod = "unknown" as const;
      const paidTax = args.amountYen - items.reduce((sum, item) => sum + item.printedAmountYen, 0);
      const hasReconciledExternalTax =
        basis === "tax_excluded" &&
        taxableRates.length === 1 &&
        [Math.floor(exactTax), Math.ceil(exactTax)].includes(paidTax) &&
        lines.some(
          (line) =>
            isReceiptTotalLabel(line.rawText) &&
            taxSummaryLineKind(line.rawText) === undefined &&
            line.amountYen === args.amountYen,
        ) &&
        targetLines.some((line) => line.amountYen === target);
      const estimatedTax = resolvedExternal.get(rate) ?? Math.round(exactTax);
      const tax =
        rate === 0 ? (correctedTax ?? taxes[0] ?? 0) : (correctedTax ?? taxes[0] ?? estimatedTax);
      if (rate !== 0 && correctedTax === undefined && taxes.length === 0) {
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
        targetLines.some((line) => {
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
        !hasReconciledExternalTax &&
        !(
          args.allowEstimates &&
          resolvedExternal.has(rate) &&
          (!hasPrintedSummaryEvidence ||
            args.paidTotalConfirmed ||
            lines.some(
              (line) =>
                isReceiptTotalLabel(line.rawText) &&
                taxSummaryLineKind(line.rawText) === undefined &&
                line.amountYen === args.amountYen,
            ))
        );
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
    },
  );
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
  const combinedTargetConflict = lines.some((line) => {
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    const declaredRates = new Set(
      [...text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g)].map((match) => Number(match[1])),
    );
    if (declaredRates.size < 2 || taxSummaryLineKind(text) !== "target") return false;
    const selected = derived.filter((summary) => declaredRates.has(summary.taxRatePercent));
    const expected = selected.reduce((sum, summary) => {
      if (/税抜|税別/.test(text)) return sum + summary.taxIncludedAmountYen! - summary.taxYen;
      if (/税込/.test(text)) return sum + summary.taxIncludedAmountYen!;
      return sum + summary.taxableAmountYen;
    }, 0);
    return selected.length !== declaredRates.size || line.amountYen !== expected;
  });
  const subtotalConflict = lines.some((line) => {
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    return (
      /小計|subtotal/i.test(text) &&
      !text.includes("%") &&
      taxSummaryLineKind(text) === "target" &&
      !aggregateAmounts.includes(line.amountYen!)
    );
  });
  const aggregateTaxIsCorrected =
    derived.some((summary) => summary.userEditedFields?.includes("taxYen")) &&
    derived.every(
      (summary) =>
        summary.userEditedFields?.includes("taxYen") ||
        (summary.taxRatePercent === 0 && summary.taxYen === 0),
    );
  const aggregateTaxConflict = lines.some((line) => {
    if (!isAggregateTaxLine(line.rawText)) return false;
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    const basisConflict =
      /外(?:消費)?税|\(外\)(?:消費)?税|税抜|税別/.test(text) &&
      derived.some((summary) => summary.taxRatePercent !== 0 && summary.taxMode === "included");
    return (
      basisConflict ||
      (!aggregateTaxIsCorrected &&
        line.amountYen !== derived.reduce((sum, summary) => sum + summary.taxYen, 0))
    );
  });
  const estimatedTotalConflict =
    derived.reduce((sum, summary) => sum + summary.taxIncludedAmountYen!, 0) !== args.amountYen;
  return derived.map((summary) =>
    combinedTargetConflict ||
    subtotalConflict ||
    (ambiguousEstimatedTax && estimatedRates.has(summary.taxRatePercent)) ||
    aggregateTaxConflict ||
    (estimatedTotalConflict && estimatedRates.has(summary.taxRatePercent))
      ? { ...summary, warnings: [...new Set([...summary.warnings, TAX_EVIDENCE_CONFLICT])] }
      : summary,
  );
}
