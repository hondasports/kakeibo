import { describe, expect, it } from "vitest";
import {
  summarizeEditedDraftItemsAmount,
  type EditedDraftItem,
} from "./editedDraftItemsAmountSummary";
import type { AiExpenseDraftItem, AiExpenseDraftJudgmentInput } from "./reviewTypes";

const externalSummary = {
  taxRatePercent: 8 as const,
  taxMode: "external" as const,
  taxableAmountYen: 404,
  taxableAmountBasis: "tax_excluded" as const,
  taxYen: 32,
  taxIncludedAmountYen: 436,
  roundingMethod: "floor" as const,
  warnings: [],
  status: "verified" as const,
};
const taxResolved = {
  taxRatePercent: 8 as const,
  taxResolutionStatus: "resolved" as const,
  taxResolutionSource: "item_explicit" as const,
  taxAllocationStatus: "allocated" as const,
};
/** 外税レシート: 税抜の印字額 98・138・168（合計404）、税額32、支払額436。 */
const externalItems: AiExpenseDraftItem[] = [
  [98, 8],
  [138, 11],
  [168, 13],
].map(([printed, tax], index) => ({
  ...taxResolved,
  _id: `item-${index}`,
  itemName: `商品${index + 1}`,
  amountYen: printed + tax,
  printedAmountYen: printed,
  normalizedAmountYen: printed + tax,
  allocatedTaxYen: tax,
  amountBasis: "tax_excluded" as const,
  categoryId: "food",
}));
const externalDraft: AiExpenseDraftJudgmentInput = {
  documentType: "receipt",
  reviewReasons: [],
  amountYen: 436,
  categoryId: "food",
  registrationMode: "detailed",
  taxSummaries: [externalSummary],
};
const asEdited = (items: AiExpenseDraftItem[]): EditedDraftItem[] =>
  items.map((item) => ({
    itemId: item._id,
    itemName: item.itemName,
    amountYen: String(item.printedAmountYen),
    categoryId: "food",
  }));

describe("履歴編集中の明細合計と金額の関係", () => {
  it("外税: 税抜の明細合計と税額を足すと支払額と一致する", () => {
    const result = summarizeEditedDraftItemsAmount({
      draft: externalDraft,
      savedItems: externalItems,
      amountYen: "436",
      categoryId: "food",
      items: asEdited(externalItems),
    });
    expect(result?.amountBasis).toBe("tax_excluded");
    expect(result?.amount).toMatchObject({
      status: "matched",
      variant: "external",
      itemsPrintedTotalYen: 404,
      printedTaxYen: 32,
      paidTotalYen: 436,
    });
  });

  it("外税: 支払額を変えると、レシートの税内訳と照合できず比較不能になる（確認画面と同じ）", () => {
    const result = summarizeEditedDraftItemsAmount({
      draft: externalDraft,
      savedItems: externalItems,
      amountYen: "500",
      categoryId: "food",
      items: asEdited(externalItems),
    });
    expect(result?.amount).toMatchObject({
      status: "uncomparable",
      blockerCode: "unverified-tax-summary",
      itemsPrintedTotalYen: 404,
      paidTotalYen: 500,
    });
  });

  it("内税: 税込の明細合計が支払額と一致する", () => {
    const included: AiExpenseDraftItem[] = [
      { ...taxResolved, _id: "a", itemName: "商品A", amountYen: 108, printedAmountYen: 108 },
      { ...taxResolved, _id: "b", itemName: "商品B", amountYen: 216, printedAmountYen: 216 },
    ].map((item) => ({
      ...item,
      amountBasis: "tax_included" as const,
      normalizedAmountYen: item.amountYen,
      categoryId: "food",
    }));
    const result = summarizeEditedDraftItemsAmount({
      draft: {
        documentType: "receipt",
        reviewReasons: [],
        amountYen: 324,
        taxSummaries: [
          {
            taxRatePercent: 8,
            taxMode: "included",
            taxableAmountYen: 324,
            taxableAmountBasis: "tax_included",
            taxYen: 24,
            roundingMethod: "floor",
            warnings: [],
            status: "verified",
          },
        ],
      },
      savedItems: included,
      amountYen: "324",
      categoryId: "food",
      items: asEdited(included),
    });
    expect(result?.amountBasis).toBe("tax_included");
    expect(result?.amount).toMatchObject({
      status: "matched",
      variant: "direct",
      itemsComparableTotalYen: 324,
      paidTotalYen: 324,
    });
  });

  it("税込か税抜かが決まらない明細があると、比較できないまま不明と示す", () => {
    const unknown = externalItems.map((item) => ({
      ...item,
      amountBasis: "unknown" as const,
      taxResolutionStatus: undefined,
      taxAllocationStatus: "unallocated" as const,
      normalizedAmountYen: undefined,
    }));
    const result = summarizeEditedDraftItemsAmount({
      draft: { ...externalDraft, taxSummaries: undefined },
      savedItems: unknown,
      amountYen: "436",
      categoryId: "food",
      items: asEdited(unknown),
    });
    expect(result?.amountBasis).toBe("unknown");
    expect(result?.amount.status).toBe("uncomparable");
  });

  it("税込と税抜が混ざった明細は混在と示す", () => {
    const mixed = externalItems.map((item, index) =>
      index === 0 ? { ...item, amountBasis: "tax_included" as const } : item,
    );
    const result = summarizeEditedDraftItemsAmount({
      draft: externalDraft,
      savedItems: mixed,
      amountYen: "436",
      categoryId: "food",
      items: asEdited(mixed),
    });
    expect(result?.amountBasis).toBe("mixed");
  });

  it("追加した明細は税の設定がないので不明になり、金額の入力が空なら比較できない", () => {
    const result = summarizeEditedDraftItemsAmount({
      draft: externalDraft,
      savedItems: externalItems,
      amountYen: "436",
      categoryId: "food",
      items: [...asEdited(externalItems), { itemName: "追加", amountYen: "", categoryId: "food" }],
    });
    expect(result?.amountBasis).toBe("unknown");
    expect(result?.amount.status).toBe("uncomparable");
  });

  it("明細が0件なら何も返さない", () => {
    expect(
      summarizeEditedDraftItemsAmount({
        draft: externalDraft,
        savedItems: [],
        amountYen: "436",
        categoryId: "food",
        items: [],
      }),
    ).toBeNull();
  });
});
