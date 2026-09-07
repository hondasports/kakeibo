import { describe, expect, it } from "vitest";
import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import { effectiveReviewMode, getReviewGuidance, reviewSaveSummary } from "./reviewGuidance";
import { getReviewSubmitError } from "./reviewValidation";

const form: ReviewFormValues = {
  documentType: "receipt",
  shopName: "ジャパン",
  date: "2026-08-06",
  amountYen: "92",
  categoryId: "food",
  registrationMode: "detailed",
};
const product: ReviewItemValues = {
  id: "product",
  itemName: "パン",
  amountYen: "116",
  categoryId: "food",
};
const discount: ReviewItemValues = {
  id: "discount",
  itemName: "割引",
  amountYen: "-24",
  categoryId: "food",
};
describe("下書きの修正状態と保存内容", () => {
  it("割引対象だけを必須修正に数え、解消後は税の確認推奨だけが残る", () => {
    const before = getReviewGuidance(form, [product, discount]);
    expect(before.filter((issue) => issue.required)).toEqual([
      expect.objectContaining({ target: "discount", message: expect.stringContaining("割引対象") }),
    ]);
    const linked = { ...discount, discountTargetItemId: "product" };
    expect(getReviewGuidance(form, [product, linked]).filter((issue) => issue.required)).toEqual(
      [],
    );
    expect(getReviewSubmitError(form, [product, linked])).toBeNull();
    expect(reviewSaveSummary(form, [product, linked])).toEqual({
      itemTotal: 92,
      difference: 0,
      taxYen: undefined,
    });
  });
  it.each([
    [{ ...form, documentType: "unknown" as const }, [product], "document"],
    [{ ...form, date: "2026-02-30" }, [product], "date"],
    [{ ...form, amountYen: "0" }, [product], "amountYen"],
    [form, [{ ...product, itemName: "" }], "product"],
    [form, [{ ...product, amountYen: "-1" }], "product"],
    [form, [{ ...product, categoryId: "" }], "product"],
    [form, [product, { ...discount, amountYen: "-116", discountTargetItemId: "product" }], "items"],
  ])("保存を妨げる入力には修正先がある", (values, items, target) => {
    expect(getReviewSubmitError(values, items)).not.toBeNull();
    expect(getReviewGuidance(values, items).filter((issue) => issue.required)).toEqual(
      expect.arrayContaining([expect.objectContaining({ target })]),
    );
  });
  it("合計だけ保存では商品修正を必須にしないが、基本情報は必要", () => {
    const total = { ...form, priceTaxTreatment: "unknown" as const };
    expect(effectiveReviewMode(total)).toBe("totalOnly");
    expect(getReviewGuidance(total, [discount]).filter((issue) => issue.required)).toEqual([]);
    expect(
      getReviewGuidance({ ...total, shopName: "" }, [discount]).filter((issue) => issue.required),
    ).toEqual([expect.objectContaining({ target: "shopName" })]);
  });
  it("現在の明細と合計を照合し、空の金額や未確定の税を0円にしない", () => {
    expect(
      reviewSaveSummary({ ...form, amountYen: "200" }, [{ ...product, amountYen: "150" }]),
    ).toEqual({ itemTotal: 150, difference: 50, taxYen: undefined });
    expect(reviewSaveSummary(form, [{ ...product, amountYen: "" }])).toEqual({
      itemTotal: undefined,
      difference: undefined,
      taxYen: undefined,
    });
    expect(
      reviewSaveSummary(form, [
        {
          ...product,
          amountYen: "92",
          normalizedAmountYen: 92,
          allocatedTaxYen: 6,
          taxRatePercent: 8,
          amountBasis: "tax_included",
          taxResolutionStatus: "resolved",
          taxResolutionSource: "item_explicit",
        },
      ]).taxYen,
    ).toBe(6);
  });
});
