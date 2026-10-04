import type {
  AmountBasis,
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  TaxContextResolution,
  TaxEvidence,
  TaxRatePercent,
  TaxResolutionSource,
} from "./types";

function resolveBasis(summary: ExtractedTaxSummary): AmountBasis {
  if (summary.taxableAmountBasis !== "unknown") return summary.taxableAmountBasis;
  if (summary.taxMode === "external") return "tax_excluded";
  if (summary.taxMode === "included") return "tax_included";
  return "unknown";
}

function resolved(
  summary: ExtractedTaxSummary,
  source: TaxResolutionSource,
): TaxContextResolution | undefined {
  const amountBasis = resolveBasis(summary);
  if (amountBasis === "unknown") return undefined;
  return { status: "resolved", taxRatePercent: summary.taxRatePercent, amountBasis, source };
}

function itemTotal(items: ExtractedReceiptItem[], indexes: number[]) {
  return indexes.reduce((sum, index) => sum + items[index].printedAmountYen, 0);
}

function findUniqueSubset(
  items: ExtractedReceiptItem[],
  indexes: number[],
  target: number,
): number[] | undefined {
  if (target === 0) return undefined;
  const monetaryIndexes = indexes.filter((index) => items[index].printedAmountYen !== 0);
  let states = new Map<number, { count: 1 | 2; indexes: number[] }>([
    [0, { count: 1, indexes: [] }],
  ]);
  for (const itemIndex of monetaryIndexes) {
    const next = new Map(
      [...states].map(([sum, state]) => [sum, { count: state.count, indexes: [...state.indexes] }]),
    );
    for (const [sum, state] of states) {
      const newSum = sum + items[itemIndex].printedAmountYen;
      const existing = next.get(newSum);
      if (!existing) {
        next.set(newSum, { count: state.count, indexes: [...state.indexes, itemIndex] });
      } else {
        next.set(newSum, { count: 2, indexes: [...existing.indexes] });
      }
    }
    if (next.size > 20_000) return undefined;
    states = next;
  }
  const match = states.get(target);
  return match?.count === 1 && match.indexes.length > 0 ? match.indexes : undefined;
}

export function resolveTaxContext(args: {
  amountYen: number;
  items: ExtractedReceiptItem[];
  taxSummaries: ExtractedTaxSummary[];
  evidence: TaxEvidence[];
}): TaxContextResolution[] {
  const contexts: TaxContextResolution[] = args.items.map((item) => ({
    status: "unresolved",
    taxRatePercent: item.taxRatePercent,
    amountBasis: item.amountBasis,
    reasons: [],
  }));

  const processableSummaries = args.taxSummaries.filter(
    (summary) =>
      summary.status === undefined ||
      summary.status === "verified" ||
      summary.status === "coherent",
  );
  // 同率の税込・税抜併記は計算に使えても、未確定明細の価格区分を一意に示さない。
  const inferenceSummaries = processableSummaries.filter(
    (summary) =>
      processableSummaries.filter((other) => other.taxRatePercent === summary.taxRatePercent)
        .length === 1,
  );
  const canInferFrom = (summary: ExtractedTaxSummary, index: number) => {
    const item = args.items[index];
    return (
      (item.taxRatePercent === null || item.taxRatePercent === summary.taxRatePercent) &&
      (item.amountBasis === "unknown" || item.amountBasis === resolveBasis(summary))
    );
  };

  args.items.forEach((item, index) => {
    if (item.taxRatePercent === null) return;
    const matching = inferenceSummaries.filter(
      (summary) => summary.taxRatePercent === item.taxRatePercent,
    );
    const basis = item.amountBasis;
    if (basis !== "unknown") {
      contexts[index] = {
        status: "resolved",
        taxRatePercent: item.taxRatePercent,
        amountBasis: basis,
        source: "item_explicit",
      };
    } else if (matching.length === 1) {
      const context = resolved(matching[0], "summary_reconciliation");
      if (context) contexts[index] = context;
    }
  });

  const markerRates = new Map<number, TaxRatePercent>();
  const conflictedMarkerIndexes = new Set<number>();
  for (const evidence of args.evidence) {
    if (evidence.type !== "marker_legend" || evidence.interpretedTaxRatePercent === undefined)
      continue;
    if (conflictedMarkerIndexes.has(evidence.itemIndex)) continue;
    const previous = markerRates.get(evidence.itemIndex);
    if (previous === undefined || previous === evidence.interpretedTaxRatePercent) {
      markerRates.set(evidence.itemIndex, evidence.interpretedTaxRatePercent);
    } else {
      markerRates.delete(evidence.itemIndex);
      conflictedMarkerIndexes.add(evidence.itemIndex);
    }
  }
  for (const summary of inferenceSummaries) {
    const indexes = args.items
      .map((_, index) => index)
      .filter(
        (index) =>
          contexts[index].status === "unresolved" &&
          markerRates.get(index) === summary.taxRatePercent &&
          canInferFrom(summary, index),
      );
    if (indexes.length === 0 || itemTotal(args.items, indexes) !== summary.taxableAmountYen)
      continue;
    const context = resolved(summary, "marker_reconciled");
    if (context) indexes.forEach((index) => (contexts[index] = context));
  }

  const unresolved = () =>
    args.items.map((_, index) => index).filter((index) => contexts[index].status === "unresolved");
  if (inferenceSummaries.length === 1 && unresolved().length > 0) {
    const indexes = unresolved();
    const resolvedIndexes = args.items
      .map((_, index) => index)
      .filter((index) => contexts[index].status === "resolved");
    const summary = inferenceSummaries[0];
    if (
      indexes.every((index) => canInferFrom(summary, index)) &&
      itemTotal(args.items, [...resolvedIndexes, ...indexes]) === summary.taxableAmountYen
    ) {
      const context = resolved(summary, "single_summary");
      if (context) indexes.forEach((index) => (contexts[index] = context));
    }
  }

  let madeProgress = true;
  while (madeProgress && unresolved().length > 0) {
    madeProgress = false;
    const unresolvedIndexes = unresolved();
    const proposals = inferenceSummaries.flatMap((summary) => {
      const alreadyResolved = args.items.reduce((sum, item, index) => {
        const context = contexts[index];
        return context.status === "resolved" && context.taxRatePercent === summary.taxRatePercent
          ? sum + item.printedAmountYen
          : sum;
      }, 0);
      const indexes = findUniqueSubset(
        args.items,
        unresolvedIndexes.filter((index) => canInferFrom(summary, index)),
        summary.taxableAmountYen - alreadyResolved,
      );
      return indexes ? [{ summary, indexes }] : [];
    });
    for (const proposal of proposals) {
      const conflicts = proposals.some(
        (other) =>
          other !== proposal && other.indexes.some((index) => proposal.indexes.includes(index)),
      );
      if (conflicts || proposal.indexes.some((index) => contexts[index].status === "resolved")) {
        continue;
      }
      const context = resolved(proposal.summary, "summary_reconciliation");
      if (!context) continue;
      proposal.indexes.forEach((index) => (contexts[index] = context));
      madeProgress = true;
    }
  }

  const unresolvedIndexes = unresolved();
  if (unresolvedIndexes.length > 0) {
    const candidates = inferenceSummaries.filter((summary) => {
      if (!unresolvedIndexes.every((index) => canInferFrom(summary, index))) return false;
      const resolvedTotal = args.items.reduce((sum, item, index) => {
        const context = contexts[index];
        return context.status === "resolved" && context.taxRatePercent === summary.taxRatePercent
          ? sum + item.printedAmountYen
          : sum;
      }, 0);
      return summary.taxableAmountYen - resolvedTotal === itemTotal(args.items, unresolvedIndexes);
    });
    if (candidates.length === 1) {
      const context = resolved(candidates[0], "remaining_summary");
      if (context) unresolvedIndexes.forEach((index) => (contexts[index] = context));
    }
  }

  return contexts.map((context) => {
    if (context.status === "resolved") return context;
    const reasons = [...context.reasons];
    if (context.taxRatePercent === null) reasons.push("unresolved_tax_rate");
    if (context.amountBasis === "unknown") reasons.push("unresolved_amount_basis");
    return { ...context, reasons };
  });
}
