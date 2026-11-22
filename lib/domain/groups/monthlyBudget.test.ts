import { describe, expect, it } from "vitest";
import { monthlyBudgetProgress, validateMonthlyBudgetYen } from "./monthlyBudget";

describe("validateMonthlyBudgetYen", () => {
  it("nullとundefinedは予算解除として受理する", () => {
    expect(validateMonthlyBudgetYen(null)).toEqual({ success: true, amountYen: undefined });
    expect(validateMonthlyBudgetYen(undefined)).toEqual({ success: true, amountYen: undefined });
  });

  it("0円と整数を受理する", () => {
    expect(validateMonthlyBudgetYen(0)).toEqual({ success: true, amountYen: 0 });
    expect(validateMonthlyBudgetYen(120_000)).toEqual({ success: true, amountYen: 120_000 });
  });

  it("負数・小数・上限超過を拒否する", () => {
    expect(validateMonthlyBudgetYen(-1).success).toBe(false);
    expect(validateMonthlyBudgetYen(1200.5).success).toBe(false);
    expect(validateMonthlyBudgetYen(1_000_000_000).success).toBe(false);
  });
});

describe("monthlyBudgetProgress", () => {
  it("消化率と残額を返す", () => {
    expect(monthlyBudgetProgress(100_000, 30_000)).toEqual({
      usedPercent: 30,
      remainingYen: 70_000,
    });
  });

  it("超過時は負の残額と100%超を返す", () => {
    const progress = monthlyBudgetProgress(50_000, 75_000);
    expect(progress.remainingYen).toBe(-25_000);
    expect(progress.usedPercent).toBe(150);
  });

  it("予算0円は支出があると100%超過、支出なしで0%", () => {
    expect(monthlyBudgetProgress(0, 1).usedPercent).toBe(100);
    expect(monthlyBudgetProgress(0, 0).usedPercent).toBe(0);
  });
});
