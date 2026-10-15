import { describe, expect, it } from "vitest";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
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
    expect.objectContaining({ target: "items", message: expect.stringContaining("120円") }),
    expect.objectContaining({ target: "items", message: expect.stringContaining("80円") }),
  ]);
});

it("印字証拠の不一致は商品確認へ案内し、内部値の修正先を作らない", () => {
  const fixture = mixedTaxReviewFixture();
  const guidance = getReviewGuidance(fixture.form, fixture.items, {
    ...fixture.draft,
    taxSummaries: fixture.draft.taxSummaries!.map((summary) => ({
      ...summary,
      status: "contradictory" as const,
      reasons: ["unresolved_tax_summary" as const],
    })),
  });
  expect(
    guidance
      .filter((issue) => issue.taxSummaryIndex !== undefined)
      .every((issue) => issue.target === "items"),
  ).toBe(true);
});

describe("確認推奨に直せない項目を出さない（Issue #1018）", () => {
  const summaryMessages = (guidance: ReturnType<typeof getReviewGuidance>) =>
    guidance.filter((issue) => issue.taxSummaryIndex !== undefined).map((issue) => issue.message);

  /** 10%・税込の商品1件と、対象額が一致する集計。理由・状態だけを差し替えて使う。 */
  function singleRate(
    summary: Partial<NonNullable<AiExpenseDraft["taxSummaries"]>[number]>,
    allocation: "allocated" | "unallocated" = "allocated",
  ) {
    const fixture = mixedTaxReviewFixture();
    const items: ReviewItemValues[] = [
      {
        ...fixture.items[0],
        amountYen: "110",
        printedAmountYen: 110,
        normalizedAmountYen: 110,
        amountBasis: "tax_included",
        taxRatePercent: 10,
        taxAllocationStatus: allocation,
        taxResolutionStatus: "resolved",
      },
    ];
    const draft: AiExpenseDraft = {
      ...fixture.draft,
      taxSummaries: [
        {
          ...fixture.draft.taxSummaries![1],
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountBasis: "tax_included",
          taxableAmountYen: 110,
          status: "verified",
          reasons: [],
          ...summary,
        },
      ],
    };
    return getReviewGuidance({ ...fixture.form, amountYen: "110" }, items, draft);
  }

  it("矛盾した集計は、商品の確認を促す文言にし、内部状態の文言を出さない", () => {
    const messages = summaryMessages(
      singleRate({ status: "contradictory", reasons: ["unresolved_tax_summary"] }, "unallocated"),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("読み取り原文と照合してください");
    expect(messages[0]).not.toContain("配分できていません");
    expect(messages[0]).not.toContain("税率別集計の読み取り内容");
  });

  it("再解釈の経過を伝えるだけの理由は、確認済みの集計に指摘として残さない", () => {
    expect(
      summaryMessages(
        singleRate({
          status: "verified",
          reasons: ["reconciled_to_included", "reconciled_to_external"],
        }),
      ),
    ).toEqual([]);
  });

  it("商品を直せば解消する矛盾（対象額の差）は具体的な金額つきで残す", () => {
    expect(summaryMessages(singleRate({ taxableAmountYen: 999 }))).toEqual([
      expect.stringContaining("999円"),
    ]);
  });
});
