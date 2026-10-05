import { describe, expect, it } from "vitest";
import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import { effectiveReviewMode, getReviewGuidance } from "./reviewGuidance";
import { buildAmountCheck } from "./reviewAmountChecks";
import { getReviewSubmitErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";
import { mixedTaxReviewFixture } from "./reviewTaxPreviewTestHelpers";
import { buildReviewTaxPreview } from "./reviewItemsTaxPreview";

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

it("税内訳を補完しても、読み取り確認・割引対象・カテゴリ修正を消さない", () => {
  const fixture = mixedTaxReviewFixture();
  const preview = buildReviewTaxPreview(fixture.items, {
    paidTotalYen: 1782,
    taxSummaries: fixture.draft.taxSummaries,
  });
  const guidance = getReviewGuidance(
    fixture.form,
    [
      ...preview.items.map((item, index) => (index === 1 ? { ...item, categoryId: "" } : item)),
      { ...discount, amountYen: "0" },
    ],
    { ...fixture.draft, taxSummaries: preview.taxSummaries, reviewReasons: ["low_confidence"] },
  );
  expect(guidance.map((issue) => issue.id)).toEqual(
    expect.arrayContaining(["reading", "discount-discount", "category-item-1"]),
  );
  expect(guidance.some((issue) => issue.id.startsWith("summary-"))).toBe(false);
});

it("合計だけ一致して税率別対象額がずれる場合は両税率の修正を残す", () => {
  const fixture = mixedTaxReviewFixture();
  const items = [8, 10].map((rate, index) => ({
    ...fixture.items[index],
    amountYen: "100",
    printedAmountYen: 100,
    normalizedAmountYen: 100,
    amountBasis: "tax_included" as const,
    taxRatePercent: rate as 8 | 10,
    taxAllocationStatus: "allocated" as const,
  }));
  const taxSummaries = fixture.draft.taxSummaries!.map((summary, index) => ({
    ...summary,
    taxMode: "included" as const,
    taxableAmountBasis: "tax_included" as const,
    taxableAmountYen: index === 0 ? 120 : 80,
    status: "verified" as const,
    reasons: [],
  }));
  const guidance = getReviewGuidance({ ...fixture.form, amountYen: "200" }, items, {
    ...fixture.draft,
    taxSummaries,
  });
  expect(guidance.filter((issue) => issue.taxSummaryIndex !== undefined)).toEqual([
    expect.objectContaining({ target: "tax-summary-0", message: expect.stringContaining("120円") }),
    expect.objectContaining({ target: "tax-summary-1", message: expect.stringContaining("80円") }),
  ]);
});
