import { describe, expect, it } from "vitest";
import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import { effectiveReviewMode, getReviewGuidance } from "./reviewGuidance";
import { buildAmountCheck } from "./reviewChecks";
import { getReviewSubmitErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";

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
  it("割引対象の未確定は確認項目として残し、下書き保存は妨げない", () => {
    const before = getReviewGuidance(form, [product, discount]);
    expect(before.filter((issue) => issue.required)).toEqual([]);
    expect(before).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "discount",
          required: false,
          message: expect.stringContaining("割引対象"),
        }),
      ]),
    );
    // 確認項目を残したまま下書きを保存できる
    expect(getReviewSubmitErrorMessage(form, [product, discount])).toBeNull();
    const linked = { ...discount, discountTargetItemId: "product" };
    expect(getReviewGuidance(form, [product, linked]).filter((issue) => issue.required)).toEqual(
      [],
    );
    expect(getReviewSubmitErrorMessage(form, [product, linked])).toBeNull();
    expect(
      buildAmountCheck({
        items: [product, linked],
        paidTotalYen: Number(form.amountYen),
      }),
    ).toMatchObject({ status: "matched" });
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
    expect(getReviewSubmitErrorMessage(values, items)).not.toBeNull();
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
  it("明細と支払額の差は金額確認が担い、空の金額は比較不能にする", () => {
    expect(
      buildAmountCheck({
        items: [{ ...product, amountYen: "150" }],
        paidTotalYen: 200,
      }),
    ).toMatchObject({ status: "mismatch", differenceYen: -50 });
    expect(
      buildAmountCheck({
        items: [{ ...product, amountYen: "" }],
        paidTotalYen: 92,
      }).status,
    ).toBe("uncomparable");
  });
});
