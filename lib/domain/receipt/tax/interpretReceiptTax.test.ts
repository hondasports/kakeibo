import { describe, expect, it } from "vitest";
import { interpretReceiptTax as interpretReceiptTaxRaw } from "./interpretReceiptTax";
import type { ReceiptTaxInput } from "./types";

function interpretReceiptTax(input: ReceiptTaxInput) {
  return interpretReceiptTaxRaw({
    receiptTotalSource: "explicit_label",
    receiptTotalConfidence: 0.99,
    ...input,
  });
}

const summary = (
  taxRatePercent: 0 | 8 | 10,
  taxableAmountYen: number,
  taxYen: number,
  taxableAmountBasis: "tax_included" | "tax_excluded",
) => ({
  taxRatePercent,
  taxMode: taxableAmountBasis === "tax_excluded" ? ("external" as const) : ("included" as const),
  taxableAmountYen,
  taxableAmountBasis,
  taxYen,
  roundingMethod: "unknown" as const,
  confidence: {},
  warnings: [],
});

const item = (printedAmountYen: number, markers: string[] = []) => ({
  itemName: "item",
  printedAmountYen,
  taxRatePercent: null,
  amountBasis: "unknown" as const,
  markers,
  warnings: [],
});

describe("interpretReceiptTax", () => {
  it("単一8%外税summaryとの一致から未解決明細を解決して税額を按分する", () => {
    const input: ReceiptTaxInput = {
      amountYen: 8562,
      items: [item(4000), item(3928)],
      taxSummaries: [summary(8, 7928, 634, "tax_excluded")],
    };
    const result = interpretReceiptTax(input);
    expect(result.items.every((value) => value.taxContext.status === "resolved")).toBe(true);
    expect(result.items.map((value) => value.taxRatePercent)).toEqual([8, 8]);
    expect(result.items.map((value) => value.amountBasis)).toEqual([
      "tax_excluded",
      "tax_excluded",
    ]);
    expect(result.items.reduce((sum, value) => sum + value.allocatedTaxYen, 0)).toBe(634);
    expect(result.items.reduce((sum, value) => sum + value.normalizedAmountYen, 0)).toBe(8562);
    expect(result.warnings).toEqual([]);
  });

  it("単一10%内税summaryでは印字額を維持する", () => {
    const result = interpretReceiptTax({
      amountYen: 1060,
      items: [item(1060)],
      taxSummaries: [summary(10, 1060, 96, "tax_included")],
    });
    expect(result.items[0]).toMatchObject({
      taxRatePercent: 10,
      amountBasis: "tax_included",
      normalizedAmountYen: 1060,
      allocatedTaxYen: 96,
      taxContext: { status: "resolved", source: "single_summary" },
    });
  });

  it("凡例マーカー候補はsummary完全一致後にだけ解決する", () => {
    const result = interpretReceiptTax({
      amountYen: 1683,
      items: [item(1000, ["*"]), item(559, ["*"])],
      taxSummaries: [summary(8, 1559, 124, "tax_excluded")],
      markerDefinitions: [{ marker: "*", description: "軽減税率8%対象" }],
    });
    expect(result.items.every((value) => value.taxContext.status === "resolved")).toBe(true);
    expect(result.items.map((value) => value.taxContext)).toEqual([
      expect.objectContaining({ source: "marker_reconciled", taxRatePercent: 8 }),
      expect.objectContaining({ source: "marker_reconciled", taxRatePercent: 8 }),
    ]);
  });

  it("解決済みマーカー群を除いた残額を残りsummaryへ割り当てる", () => {
    const result = interpretReceiptTax({
      amountYen: 2405,
      items: [item(139, ["*"]), item(1060), item(1100), item(-110)],
      taxSummaries: [summary(8, 139, 11, "tax_excluded"), summary(10, 2050, 205, "tax_excluded")],
      markerDefinitions: [{ marker: "*", description: "8%対象" }],
    });
    expect(result.items[0].taxContext).toMatchObject({ source: "marker_reconciled" });
    expect(result.items.slice(1).every((value) => value.taxRatePercent === 10)).toBe(true);
    expect(result.items.slice(1).every((value) => value.taxContext.status === "resolved")).toBe(
      true,
    );
    expect(result.warnings).toEqual([]);
  });

  it("明細の組み合わせが一意ならsummaryとの照合で税率を解決する", () => {
    const result = interpretReceiptTax({
      amountYen: 700,
      items: [item(100), item(200), item(400)],
      taxSummaries: [summary(8, 300, 0, "tax_included"), summary(10, 400, 0, "tax_included")],
    });
    expect(result.items.map((value) => value.taxRatePercent)).toEqual([8, 8, 10]);
    expect(result.items.map((value) => value.taxContext)).toEqual([
      expect.objectContaining({ source: "summary_reconciliation" }),
      expect.objectContaining({ source: "summary_reconciliation" }),
      expect.objectContaining({ source: "summary_reconciliation" }),
    ]);
  });

  it("複数税率の組み合わせが一意でなければ未解決のままにする", () => {
    const result = interpretReceiptTax({
      amountYen: 1000,
      items: [item(300), item(300), item(400)],
      taxSummaries: [summary(8, 500, 0, "tax_included"), summary(10, 500, 0, "tax_included")],
    });
    expect(result.items.every((value) => value.taxContext.status === "unresolved")).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["unresolved_tax_rate:items[0]", "missing_tax_items:8"]),
    );
  });

  it("マーカー単独では税率を解決しない", () => {
    const result = interpretReceiptTax({
      amountYen: 100,
      items: [item(100, ["*"])],
      taxSummaries: [],
    });
    expect(result.items[0].taxContext.status).toBe("unresolved");
    expect(result.items[0].warnings).toEqual(
      expect.arrayContaining(["unresolved_tax_rate", "unresolved_amount_basis"]),
    );
  });

  it("明示basisとsummaryのbasisが矛盾すれば不整合を警告する", () => {
    const explicit = {
      ...item(100),
      taxRatePercent: 8 as const,
      amountBasis: "tax_included" as const,
    };
    const result = interpretReceiptTax({
      amountYen: 108,
      items: [explicit],
      taxSummaries: [summary(8, 100, 8, "tax_excluded")],
    });
    expect(result.warnings).toContain("taxable_amount_mismatch:8");
    expect(result.items[0].allocatedTaxYen).toBe(0);
  });

  it("重複summaryを二重按分せず警告する", () => {
    const duplicate = summary(8, 100, 8, "tax_excluded");
    const result = interpretReceiptTax({
      amountYen: 108,
      items: [item(100)],
      taxSummaries: [duplicate, duplicate],
    });
    expect(result.items[0].allocatedTaxYen).toBe(8);
    expect(result.warnings).toContain("duplicate_tax_summary:8");
  });

  it("同一税率で内容が異なるsummaryは矛盾として按分しない", () => {
    const result = interpretReceiptTax({
      amountYen: 108,
      items: [item(100)],
      taxSummaries: [summary(8, 100, 8, "tax_excluded"), summary(8, 90, 7, "tax_excluded")],
    });

    expect(result.items[0].allocatedTaxYen).toBe(0);
    expect(result.warnings).toContain("conflicting_tax_summary:8");
    expect(result.taxSummaries.map((value) => value.status)).toEqual([
      "contradictory",
      "contradictory",
    ]);
    expect(
      result.taxSummaries.every((value) => value.reasons?.includes("unresolved_tax_summary")),
    ).toBe(true);
  });

  it("内税解決済み明細がある混合レシートでは外税summaryの implied tax 按分をスキップする", () => {
    const result = interpretReceiptTax({
      amountYen: 1100,
      items: [{ ...item(1000), taxRatePercent: 10, amountBasis: "tax_included" }, item(50)],
      taxSummaries: [summary(8, 100, 8, "tax_excluded")],
    });

    expect(result.items[0].amountBasis).toBe("tax_included");
    expect(result.items[1].allocatedTaxYen).toBe(0);
    expect(result.items[1].normalizedAmountYen).toBe(50);
  });

  it("フレッシュ石守相当: 算術一致だけでは外税補正・税按分しない", () => {
    const wrongOcrSummary = {
      taxRatePercent: 8 as const,
      taxMode: "included" as const,
      taxableAmountYen: 7928,
      taxableAmountBasis: "tax_included" as const,
      taxYen: 634,
      roundingMethod: "unknown" as const,
      confidence: {},
      warnings: [] as string[],
    };
    const result = interpretReceiptTax({
      amountYen: 8562,
      items: [item(4000), item(3966), item(-8)],
      taxSummaries: [wrongOcrSummary],
    });

    expect(result.taxSummaries[0]).toMatchObject({
      taxMode: "included",
      taxableAmountBasis: "tax_included",
      status: "contradictory",
    });
    expect(result.items.every((value) => value.taxContext.status === "unresolved")).toBe(true);
    expect(result.items.reduce((sum, value) => sum + value.allocatedTaxYen, 0)).toBe(0);
    expect(result.items.reduce((sum, value) => sum + value.normalizedAmountYen, 0)).toBe(7958);
    expect(result.receiptTotalResolution.protectedAmountYen).toBe(8562);
    expect(result.receiptTotalResolution.status).toBe("ambiguous");
    expect(result.warnings).toContain("ambiguous_receipt_total");
    expect(result.taxSummaries[0].reasons).toContain("tax_summary_amount_mismatch");
  });
});
