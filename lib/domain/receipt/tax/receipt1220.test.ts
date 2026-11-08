import { expect, it } from "vitest";
import { buildReviewTaxPreview } from "../../aiExpenseDrafts/reviewItemsTaxPreview";
import { buildDraftRegistrationItems } from "../../aiExpenseDrafts/registrationItems";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { classifications, lines, mkItems, sourceTaxSummaries } from "./fixtures/receipt1220";

it("匿名化されたレシートの未確定明細に税抜の税額を配分する", () => {
  const items = mkItems("unknown").map((item: any) => ({
    ...item,
    taxResolutionStatus: "unresolved",
    taxConfirmedFields: [],
  }));
  const preview = buildReviewTaxPreview(items, {
    paidTotalYen: 842,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    markerDefinitions: [{ marker: "*", description: "軽減税率対象" }],
    rawObservation: { source: "ai_ocr", lines } as any,
    receiptLineClassifications: classifications,
  });
  expect(preview.taxSummaries[0].status).toBe("verified");
  expect(preview.taxSummaries[0].reasons).toContain("reconciled_to_external");
  expect(preview.items.map((item) => item.amountBasis)).toEqual(Array(5).fill("tax_excluded"));
  expect(preview.items.map((item) => item.allocatedTaxYen)).toEqual([13, 12, 11, 13, 13]);
  expect(preview.items.map((item) => item.taxAllocationStatus)).toEqual(Array(5).fill("allocated"));
});

it("ユーザーが確定した税込明細を税抜に変更しない", () => {
  const preview = buildReviewTaxPreview(mkItems("tax_included"), {
    paidTotalYen: 842,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservation: { source: "ai_ocr", lines } as any,
    receiptLineClassifications: classifications,
  });
  expect(preview.items.every((item) => item.amountBasis === "tax_included")).toBe(true);
  expect(preview.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
});

it("読めない税額行がある場合は明細を自動確定しない", () => {
  const unreadable = lines.map((line) =>
    line.sourceLineIndex === 13
      ? { ...line, amountYen: null, amountText: null, rawText: "消費税等（8%）" }
      : line,
  );
  const items = mkItems("unknown").map((item: any) => ({
    ...item,
    taxResolutionStatus: "unresolved",
    taxConfirmedFields: [],
  }));
  const preview = buildReviewTaxPreview(items, {
    paidTotalYen: 842,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservation: { source: "ai_ocr", lines: unreadable } as any,
    receiptLineClassifications: classifications,
  });
  expect(preview.items.every((item) => item.taxAllocationStatus !== "allocated")).toBe(true);
});

it("再解釈した保存値を登録ガードでも同じ税額として扱う", () => {
  const input = {
    amountYen: 842,
    items: mkItems("unknown").map((item: any) => ({
      ...item,
      taxResolutionStatus: "unresolved",
      taxConfirmedFields: [],
    })),
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservationLines: lines,
    receiptLineClassifications: classifications,
    markerDefinitions: [{ marker: "*", description: "軽減税率対象" }],
  };
  const saved = reinterpretDraftTax(input as never);
  expect(saved.itemFields.map((item) => item.allocatedTaxYen)).toEqual([13, 12, 11, 13, 13]);
  const draft = {
    amountYen: 842,
    categoryId: "food",
    taxSummaries: saved.interpretation.taxSummaries,
    receiptInterpretation: {
      values: { taxSummaries: sourceTaxSummaries, receiptLineClassifications: classifications },
    },
    rawObservation: { source: "ai_ocr", lines },
    markerDefinitions: input.markerDefinitions,
  };
  const savedItems = saved.itemFields.map((fields, index) => ({
    ...input.items[index],
    ...fields,
    amountYen: fields.normalizedAmountYen,
    categoryId: "food",
  }));
  const repeated = reinterpretDraftTax({ ...input, items: savedItems } as never);
  expect(repeated.interpretation.taxSummaries[0].reasons).toContain("reconciled_to_external");
  expect(buildDraftRegistrationItems(draft as never, savedItems as never)).toEqual([
    expect.objectContaining({ categoryId: "food", amountYen: 842 }),
  ]);
});

it("ユーザーが明細の税込税抜を不明に戻した操作を維持する", () => {
  const result = reinterpretDraftTax({
    amountYen: 842,
    items: mkItems("unknown"),
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservationLines: lines,
    receiptLineClassifications: classifications,
    override: { itemIndex: 0, amountBasis: "unknown" },
  } as never);
  expect(result.itemFields[0].amountBasis).toBe("unknown");
  expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
});

it("不明への変更を再解釈とプレビュー後も維持して登録を拒否する", () => {
  const items = mkItems("tax_excluded");
  const input = {
    amountYen: 842,
    items,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservationLines: lines,
    receiptLineClassifications: classifications,
  };
  const first = reinterpretDraftTax({
    ...input,
    override: { itemIndex: 0, amountBasis: "unknown" },
  } as never);
  expect(first.itemFields[0].taxConfirmedFields).toContain("amountBasis");
  const saved = items.map((item: any, i: number) => ({ ...item, ...first.itemFields[i] }));
  const repeated = reinterpretDraftTax({ ...input, items: saved } as never);
  expect(repeated.itemFields[0]).toMatchObject({
    amountBasis: "unknown",
    taxAllocationStatus: "unallocated",
  });
  const preview = buildReviewTaxPreview(saved, {
    paidTotalYen: 842,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservation: { source: "ai_ocr", lines } as any,
    receiptLineClassifications: classifications,
  });
  expect(preview.items[0]).toMatchObject({
    amountBasis: "unknown",
    taxAllocationStatus: "unallocated",
  });
  const draft = {
    amountYen: 842,
    categoryId: "food",
    taxSummaries: sourceTaxSummaries,
    receiptInterpretation: {
      values: { taxSummaries: sourceTaxSummaries, receiptLineClassifications: classifications },
    },
    rawObservation: { source: "ai_ocr", lines },
  };
  expect(() =>
    buildDraftRegistrationItems(
      draft as never,
      saved.map((item: any) => ({
        ...item,
        amountYen: item.normalizedAmountYen,
        categoryId: "food",
      })) as never,
    ),
  ).toThrow(/未確定/);
});

it("不明に戻して保存した明細はプレビューでも不明のままになる", () => {
  const items = mkItems("tax_excluded");
  const first = reinterpretDraftTax({
    amountYen: 842,
    items,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservationLines: lines,
    receiptLineClassifications: classifications,
    override: { itemIndex: 0, amountBasis: "unknown" },
  } as never);
  const saved = items.map((item: any, index: number) => ({ ...item, ...first.itemFields[index] }));
  const preview = buildReviewTaxPreview(saved, {
    paidTotalYen: 842,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservation: { source: "ai_ocr", lines } as any,
    receiptLineClassifications: classifications,
  });
  expect(preview.items[0]).toMatchObject({
    amountBasis: "unknown",
    taxAllocationStatus: "unallocated",
  });
});

it("不明への変更後に税抜を選び直すと税抜で配分する", () => {
  const items = mkItems("tax_excluded");
  const input = {
    amountYen: 842,
    items,
    taxSummaries: sourceTaxSummaries,
    sourceTaxSummaries,
    rawObservationLines: lines,
    receiptLineClassifications: classifications,
  };
  const first = reinterpretDraftTax({
    ...input,
    override: { itemIndex: 0, amountBasis: "unknown" },
  } as never);
  const saved = items.map((item: any, i: number) => ({ ...item, ...first.itemFields[i] }));
  const selected = reinterpretDraftTax({
    ...input,
    items: saved,
    override: { itemIndex: 0, amountBasis: "tax_excluded" },
  } as never);
  expect(selected.itemFields[0]).toMatchObject({
    amountBasis: "tax_excluded",
    taxAllocationStatus: "allocated",
    allocatedTaxYen: 13,
  });
});
