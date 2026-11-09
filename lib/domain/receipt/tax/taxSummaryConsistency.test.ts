import { describe, expect, it } from "vitest";
import {
  isVerifiedTaxSummaryStatus,
  reconcileTaxSummary,
  normalizeTaxSummary,
} from "./taxSummaryConsistency";
import type { ExtractedTaxSummary } from "./types";
import { validateTaxSummaryConsistency } from "./taxSummaryConsistency";

function baseSummary(overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary {
  return {
    taxRatePercent: 10,
    taxMode: "included",
    taxableAmountYen: 1060,
    taxableAmountBasis: "tax_included",
    taxYen: 96,
    taxIncludedAmountYen: 1060,
    roundingMethod: "unknown",
    confidence: {},
    warnings: [],
    ...overrides,
  };
}

describe("taxSummaryConsistency matrix", () => {
  it.each([
    ["mixed", "tax_included", "ambiguous", ["mixed_tax_mode"]],
    ["unknown", "tax_included", "ambiguous", ["reconciled_to_included"]],
    ["included", "unknown", "ambiguous", ["reconciled_to_included"]],
    ["included", "tax_included", "contradictory", ["tax_included_amount_mismatch"]],
    [
      "included",
      "tax_excluded",
      "contradictory",
      ["included_mode_with_tax_excluded_basis", "tax_summary_amount_mismatch"],
    ],
    [
      "external",
      "tax_included",
      "contradictory",
      ["external_mode_with_tax_included_basis", "tax_summary_amount_mismatch"],
    ],
  ] as const)(
    "税込合計と支払額が異なる %s / %s の従来の判定を維持する",
    (taxMode, taxableAmountBasis, status, reasons) => {
      const summary = baseSummary({
        taxMode,
        taxableAmountBasis,
        taxableAmountYen: 1060,
        taxIncludedAmountYen: 960,
      });
      expect(reconcileTaxSummary({ summary, amountYen: 1060 })).toEqual({ status, reasons });
    },
  );

  it.each([
    ["included", "tax_excluded", 780, 62, 842, "external", "tax_excluded"],
    ["external", "tax_included", 842, 62, 842, "included", "tax_included"],
  ] as const)(
    "算術で一意に決まる矛盾した宣言を照合する: %s / %s",
    (mode, basis, taxable, tax, total, expectedMode, expectedBasis) => {
      const summary = baseSummary({
        taxMode: mode,
        taxableAmountBasis: basis,
        taxableAmountYen: taxable,
        taxYen: tax,
        taxIncludedAmountYen: total,
      });
      expect(reconcileTaxSummary({ summary, amountYen: total })).toEqual({
        status: "verified",
        reasons: [`reconciled_to_${expectedMode}`],
      });
      expect(normalizeTaxSummary(summary, total)).toMatchObject({
        taxMode: expectedMode,
        taxableAmountBasis: expectedBasis,
        status: "verified",
        reasons: [`reconciled_to_${expectedMode}`],
      });
    },
  );

  it.each([
    [100, 0, 100],
    [100, 8, 109],
  ] as const)("算術が複数または不成立の矛盾した宣言を確定しない", (taxable, tax, total) => {
    const result = normalizeTaxSummary(
      baseSummary({
        taxMode: "included",
        taxableAmountBasis: "tax_excluded",
        taxableAmountYen: taxable,
        taxYen: tax,
        taxIncludedAmountYen: total,
      }),
      total,
    );
    expect(result.status).toBe("contradictory");
    expect(result.taxMode).toBe("included");
    expect(result.taxableAmountBasis).toBe("tax_excluded");
  });

  it("2税率のうち算術が一致する食い違いだけを照合する", () => {
    const summaries = [
      baseSummary({
        taxRatePercent: 8,
        taxMode: "included",
        taxableAmountBasis: "tax_excluded",
        taxableAmountYen: 780,
        taxYen: 62,
        taxIncludedAmountYen: 842,
      }),
      baseSummary({
        taxRatePercent: 10,
        taxMode: "external",
        taxableAmountBasis: "tax_excluded",
        taxableAmountYen: 100,
        taxYen: 10,
        taxIncludedAmountYen: 110,
      }),
    ];
    expect(
      validateTaxSummaryConsistency({ amountYen: 952, taxSummaries: summaries }),
    ).toMatchObject([
      { status: "verified", taxMode: "external", reasons: ["reconciled_to_external"] },
      { status: "verified", taxMode: "external" },
    ]);
  });

  it("legacy status は安全側のcanonical statusとして読む", () => {
    expect(isVerifiedTaxSummaryStatus("coherent")).toBe(true);
    expect(isVerifiedTaxSummaryStatus("reconcilable")).toBe(false);
    expect(isVerifiedTaxSummaryStatus("conflicting")).toBe(false);
  });

  it("included / tax_included / A = P => verified", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({ taxableAmountYen: 1060, taxYen: 96, taxIncludedAmountYen: 1060 }),
      amountYen: 1060,
    });
    expect(result.status).toBe("verified");
    expect(result.reasons).toEqual([]);
  });

  it("external / tax_excluded / A + T = P => verified", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "external",
        taxableAmountYen: 964,
        taxableAmountBasis: "tax_excluded",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("verified");
    expect(result.reasons).toEqual([]);
  });

  it("included / tax_excluded => contradictory", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "included",
        taxableAmountYen: 960,
        taxableAmountBasis: "tax_excluded",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("included_mode_with_tax_excluded_basis");
    expect(result.reasons).toContain("tax_summary_amount_mismatch");
  });

  it("external / tax_included で算術が一致しない場合は contradictory", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "external",
        taxableAmountYen: 1059,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("external_mode_with_tax_included_basis");
  });

  it("unknown / tax_included / A = P => ambiguous without overwriting", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "unknown",
        taxableAmountYen: 1060,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("reconciled_to_included");
  });

  it("unknown / tax_excluded / A + T = P => ambiguous without overwriting", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "unknown",
        taxableAmountYen: 964,
        taxableAmountBasis: "tax_excluded",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("reconciled_to_external");
  });

  it("unknown / unknown / A + T = P => ambiguous without overwriting", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "unknown",
        taxableAmountBasis: "unknown",
        taxableAmountYen: 964,
        taxYen: 96,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("reconciled_to_external");
  });

  it("included / tax_included / A + T = P and A != P does not overwrite the declared meaning", () => {
    const result = normalizeTaxSummary(
      baseSummary({
        taxMode: "included",
        taxableAmountYen: 7928,
        taxableAmountBasis: "tax_included",
        taxYen: 634,
        taxIncludedAmountYen: 8562,
      }),
      8562,
    );
    expect(result.taxMode).toBe("included");
    expect(result.taxableAmountBasis).toBe("tax_included");
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("reconciled_to_external");
  });

  it("included / tax_included / A != P and A + T != P => ambiguous", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "included",
        taxableAmountYen: 900,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: undefined,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("ambiguous");
  });

  it("external / tax_excluded / A + T != P and I undefined => ambiguous", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "external",
        taxableAmountYen: 298,
        taxableAmountBasis: "tax_excluded",
        taxYen: 24,
        taxIncludedAmountYen: undefined,
      }),
      amountYen: 324,
    });
    expect(result.status).toBe("ambiguous");
  });

  it("I = P but A inconsistent => contradictory", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "included",
        taxableAmountYen: 960,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("tax_summary_amount_mismatch");
  });

  it("A = P but I inconsistent => contradictory", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "included",
        taxableAmountYen: 1060,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 960,
      }),
      amountYen: 1060,
    });
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("tax_included_amount_mismatch");
  });

  it("taxYen 0 with included / A = P => verified", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "included",
        taxableAmountYen: 1000,
        taxYen: 0,
        taxIncludedAmountYen: 1000,
      }),
      amountYen: 1000,
    });
    expect(result.status).toBe("verified");
  });

  it("mixed tax mode => ambiguous", () => {
    const result = reconcileTaxSummary({
      summary: baseSummary({
        taxMode: "mixed",
        taxableAmountYen: 1000,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 1000,
      }),
      amountYen: 1000,
    });
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("mixed_tax_mode");
  });

  it("multiple summaries keep verified with I undefined", () => {
    const base = baseSummary({
      taxableAmountYen: 100,
      taxYen: 8,
      taxIncludedAmountYen: undefined,
      taxRatePercent: 8,
    });
    const result = normalizeTaxSummary(base, undefined);
    expect(result.status).toBe("verified");
  });

  it("明示includedと算術一致からunknown basisを安全に補完する", () => {
    const result = normalizeTaxSummary(
      baseSummary({ taxableAmountBasis: "unknown", taxableAmountYen: 1060 }),
      1060,
    );
    expect(result).toMatchObject({
      taxMode: "included",
      taxableAmountBasis: "tax_included",
      status: "verified",
    });
  });

  it("明示externalと算術一致からunknown basisを安全に補完する", () => {
    const result = normalizeTaxSummary(
      baseSummary({
        taxMode: "external",
        taxableAmountBasis: "unknown",
        taxableAmountYen: 964,
        taxIncludedAmountYen: 1060,
      }),
      1060,
    );
    expect(result).toMatchObject({
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      status: "verified",
    });
  });

  it("照合額のない複数税率では明示modeだけでunknown basisを補完しない", () => {
    const result = normalizeTaxSummary(
      baseSummary({
        taxMode: "external",
        taxableAmountBasis: "unknown",
        taxableAmountYen: 198,
        taxYen: 16,
        taxIncludedAmountYen: undefined,
      }),
      undefined,
    );
    expect(result).toMatchObject({
      taxMode: "external",
      taxableAmountBasis: "unknown",
      status: "ambiguous",
    });
  });
});
