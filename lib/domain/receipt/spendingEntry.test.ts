import { describe, expect, it } from "vitest";
import {
  addLegacyReceiptGroups,
  buildReceiptEnrichmentMaps,
  enrichSpendingEntry,
  mapExpenseEntryToSpendingEntry,
  mapIncomeExpenseEntryToListEntry,
  mapReceiptToIncomeListEntry,
  mapReceiptToSpendingEntry,
} from "./spendingEntry";

describe("mapReceiptToSpendingEntry", () => {
  it("レシートを spending entry へ変換する", () => {
    expect(
      mapReceiptToSpendingEntry({
        _id: "r1",
        date: "2024-01-10",
        type: "expense",
        shopName: "スーパー",
        amountYen: 1000,
        categoryId: "cat-1",
      }),
    ).toEqual({
      _id: "r1",
      date: "2024-01-10",
      type: "expense",
      shopName: "スーパー",
      amountYen: 1000,
      categoryId: "cat-1",
      recordType: "receipt",
    });
  });
});

describe("mapExpenseEntryToSpendingEntry", () => {
  it("支出明細を spending entry へ変換する", () => {
    const result = mapExpenseEntryToSpendingEntry({
      _id: "e1",
      date: "2024-01-10",
      amount: 500,
      categoryId: "cat-1",
      title: "コーヒー",
      entryType: "expense",
    });
    expect(result.success).toBe(true);
    expect(result).toEqual({
      success: true,
      entry: {
        _id: "e1",
        date: "2024-01-10",
        type: "expense",
        shopName: "コーヒー",
        amountYen: 500,
        categoryId: "cat-1",
        recordType: "expenseEntry",
      },
    });
  });

  it("categoryId が未設定なら失敗", () => {
    const result = mapExpenseEntryToSpendingEntry({
      _id: "e2",
      date: "2024-01-10",
      amount: 500,
      categoryId: null,
      title: "コーヒー",
      entryType: "expense",
    });
    expect(result.success).toBe(false);
  });

  it("収入明細では title を bankName として扱う", () => {
    const result = mapExpenseEntryToSpendingEntry({
      _id: "e3",
      date: "2024-01-10",
      amount: 200000,
      categoryId: "cat-1",
      title: "給与",
      entryType: "income",
    });
    expect(result.success && result.entry.bankName).toBe("給与");
  });
});

describe("mapIncomeExpenseEntryToListEntry", () => {
  it("支出明細を income list entry へ変換する", () => {
    expect(
      mapIncomeExpenseEntryToListEntry({
        _id: "e1",
        date: "2024-01-10",
        amount: 200000,
        title: "給与",
      }),
    ).toEqual({
      _id: "e1",
      date: "2024-01-10",
      type: "income",
      bankName: "給与",
      amountYen: 200000,
      recordType: "expenseEntry",
    });
  });
});

describe("mapReceiptToIncomeListEntry", () => {
  it("レシートを income list entry へ変換する", () => {
    expect(
      mapReceiptToIncomeListEntry({
        _id: "r1",
        date: "2024-01-10",
        bankName: "給与",
        amountYen: 200000,
      }),
    ).toEqual({
      _id: "r1",
      date: "2024-01-10",
      type: "income",
      bankName: "給与",
      amountYen: 200000,
      recordType: "receipt",
    });
  });
});

describe("enrichSpendingEntry", () => {
  const baseEntry = {
    _id: "e1",
    date: "2024-01-10",
    amountYen: 500,
    categoryId: "cat-1",
    recordType: "expenseEntry" as const,
    shopName: "コーヒー",
  };

  it("sourceDocument がある場合は sourceDocument 情報で拡張する", () => {
    expect(
      enrichSpendingEntry(baseEntry, {
        sourceDocument: { _id: "sd1", shopName: "スタバ", totalAmount: 1500 },
      }),
    ).toEqual({
      ...baseEntry,
      receiptGroupId: "sourceDocument:sd1",
      receiptShopName: "スタバ",
      receiptTotalAmountYen: 1500,
      itemName: "コーヒー",
    });
  });

  it("aiExpenseDraft がある場合は draft 情報と item 名で拡張する", () => {
    expect(
      enrichSpendingEntry(baseEntry, {
        aiExpenseDraft: { _id: "d1", shopName: "ローソン", amountYen: 1000 },
        aiExpenseDraftItems: [
          { categoryId: "cat-1", itemName: "アイスコーヒー" },
          { categoryId: "cat-1", itemName: "  おにぎり  " },
        ],
      }),
    ).toEqual({
      ...baseEntry,
      aiExpenseDraftId: "d1",
      registrationMode: "detailed",
      receiptGroupId: "aiExpenseDraft:d1",
      receiptShopName: "ローソン",
      receiptTotalAmountYen: 1000,
      itemName: "アイスコーヒー、おにぎり",
    });
  });

  it("sourceDocument・draft どちらもない場合は expenseEntry 自身の情報を使う", () => {
    expect(enrichSpendingEntry(baseEntry, {})).toEqual({
      ...baseEntry,
      receiptGroupId: "expenseEntry:e1",
      receiptShopName: "コーヒー",
      receiptTotalAmountYen: 500,
    });
  });
});

describe("addLegacyReceiptGroups", () => {
  it("レシートグループ ID・店舗名・合計金額を spending entry へ追加する", () => {
    const entries = [
      {
        _id: "r1",
        date: "2024-01-10",
        amountYen: 1000,
        categoryId: "cat-1",
        recordType: "receipt" as const,
        shopName: "スーパー",
      },
    ];
    expect(addLegacyReceiptGroups(entries)).toEqual([
      {
        _id: "r1",
        date: "2024-01-10",
        amountYen: 1000,
        categoryId: "cat-1",
        recordType: "receipt",
        shopName: "スーパー",
        receiptGroupId: "receipt:r1",
        receiptShopName: "スーパー",
        receiptTotalAmountYen: 1000,
      },
    ]);
  });
});

describe("buildReceiptEnrichmentMaps", () => {
  it("他グループのドキュメント・下書きを除外する", () => {
    const { sourceDocumentMap, aiExpenseDraftMap } = buildReceiptEnrichmentMaps(
      "g1",
      [
        { _id: "sd1", groupId: "g1", shopName: "店", totalAmount: 100 },
        { _id: "sd2", groupId: "g2", shopName: "他店" },
        null,
      ],
      [
        { _id: "d1", groupId: "g1", shopName: "下書き店", registrationMode: "detailed" },
        { _id: "d2", groupId: "g2" },
      ],
      [],
    );
    expect([...sourceDocumentMap.keys()]).toEqual(["sd1"]);
    expect([...aiExpenseDraftMap.keys()]).toEqual(["d1"]);
  });

  it("明細は categoryId と itemName が揃うものだけ残す", () => {
    const { aiExpenseDraftItemsMap } = buildReceiptEnrichmentMaps(
      "g1",
      [],
      [],
      [
        [
          "d1",
          [{ categoryId: "c1", itemName: "牛乳" }, { categoryId: "c2" }, { itemName: "名前だけ" }],
        ],
      ],
    );
    expect(aiExpenseDraftItemsMap.get("d1")).toEqual([{ categoryId: "c1", itemName: "牛乳" }]);
  });
});
