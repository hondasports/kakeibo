export type SpendingEntry = {
  _id: string;
  date: string;
  type?: "expense" | "income";
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: string;
  memo?: string;
  recordType: "expenseEntry" | "receipt";
  itemName?: string;
  receiptGroupId?: string;
  receiptShopName?: string;
  receiptTotalAmountYen?: number;
  aiExpenseDraftId?: string;
  registrationMode?: "detailed" | "totalOnly";
};

export type IncomeListEntry = {
  _id: string;
  date: string;
  type: "income";
  bankName?: string;
  amountYen: number;
  memo?: string;
  recordType: "expenseEntry" | "receipt";
};

export type ReceiptForSpending = {
  _id: string;
  date: string;
  type?: "expense" | "income";
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: string;
  memo?: string;
};

export function mapReceiptToSpendingEntry(receipt: ReceiptForSpending): SpendingEntry {
  return {
    _id: receipt._id,
    date: receipt.date,
    type: receipt.type,
    shopName: receipt.shopName,
    bankName: receipt.bankName,
    amountYen: receipt.amountYen,
    categoryId: receipt.categoryId,
    memo: receipt.memo,
    recordType: "receipt",
  };
}

export type ExpenseEntryForSpending = {
  _id: string;
  date: string;
  amount: number;
  categoryId?: string | null | undefined;
  title?: string;
  memo?: string;
  entryType: "expense" | "income";
  sourceDocumentId?: string;
  aiExpenseDraftId?: string;
};

export type ExpenseEntryToSpendingError = "missing_category";

export function mapExpenseEntryToSpendingEntry(
  expenseEntry: ExpenseEntryForSpending,
):
  | { success: true; entry: SpendingEntry }
  | { success: false; error: ExpenseEntryToSpendingError } {
  if (!expenseEntry.categoryId) {
    return { success: false, error: "missing_category" };
  }
  return {
    success: true,
    entry: {
      _id: expenseEntry._id,
      date: expenseEntry.date,
      type: expenseEntry.entryType,
      shopName: expenseEntry.entryType === "expense" ? expenseEntry.title : undefined,
      bankName: expenseEntry.entryType === "income" ? expenseEntry.title : undefined,
      amountYen: expenseEntry.amount,
      categoryId: expenseEntry.categoryId,
      memo: expenseEntry.memo,
      recordType: "expenseEntry",
      aiExpenseDraftId: expenseEntry.aiExpenseDraftId,
    },
  };
}

export type ExpenseEntryForIncomeList = {
  _id: string;
  date: string;
  amount: number;
  title?: string;
  memo?: string;
};

export function mapIncomeExpenseEntryToListEntry(
  expenseEntry: ExpenseEntryForIncomeList,
): IncomeListEntry {
  return {
    _id: expenseEntry._id,
    date: expenseEntry.date,
    type: "income",
    bankName: expenseEntry.title,
    amountYen: expenseEntry.amount,
    memo: expenseEntry.memo,
    recordType: "expenseEntry",
  };
}

export type ReceiptForIncomeList = {
  _id: string;
  date: string;
  bankName?: string;
  amountYen: number;
  memo?: string;
};

export function mapReceiptToIncomeListEntry(receipt: ReceiptForIncomeList): IncomeListEntry {
  return {
    _id: receipt._id,
    date: receipt.date,
    type: "income",
    bankName: receipt.bankName,
    amountYen: receipt.amountYen,
    memo: receipt.memo,
    recordType: "receipt",
  };
}

export function addLegacyReceiptGroups(entries: SpendingEntry[]): SpendingEntry[] {
  return entries.map((entry) => ({
    ...entry,
    receiptGroupId: `receipt:${entry._id}`,
    receiptShopName: entry.shopName,
    receiptTotalAmountYen: entry.amountYen,
  }));
}

export type EnrichSpendingEntrySourceDocument = {
  _id: string;
  shopName?: string;
  totalAmount?: number;
};

export type EnrichSpendingEntryAiExpenseDraft = {
  _id: string;
  shopName?: string;
  payeeName?: string;
  amountYen?: number;
  registrationMode?: "detailed" | "totalOnly";
};

export type EnrichSpendingEntryAiExpenseDraftItem = {
  categoryId: string;
  itemName: string;
};

export type EnrichSpendingEntryArgs = {
  sourceDocument?: EnrichSpendingEntrySourceDocument;
  aiExpenseDraft?: EnrichSpendingEntryAiExpenseDraft;
  aiExpenseDraftItems?: EnrichSpendingEntryAiExpenseDraftItem[];
};

export function enrichSpendingEntry(
  entry: SpendingEntry,
  { sourceDocument, aiExpenseDraft, aiExpenseDraftItems }: EnrichSpendingEntryArgs,
): SpendingEntry {
  if (sourceDocument) {
    return {
      ...entry,
      receiptGroupId: `sourceDocument:${sourceDocument._id}`,
      receiptShopName: sourceDocument.shopName ?? entry.shopName,
      receiptTotalAmountYen: sourceDocument.totalAmount ?? entry.amountYen,
      itemName: entry.shopName,
    };
  }

  if (aiExpenseDraft) {
    const itemNames = (aiExpenseDraftItems ?? [])
      .filter((item) => item.categoryId === entry.categoryId)
      .map((item) => item.itemName.trim())
      .filter(Boolean);

    return {
      ...entry,
      receiptGroupId: `aiExpenseDraft:${aiExpenseDraft._id}`,
      receiptShopName:
        aiExpenseDraft.shopName ?? aiExpenseDraft.payeeName ?? entry.shopName ?? "不明",
      receiptTotalAmountYen: aiExpenseDraft.amountYen ?? entry.amountYen,
      aiExpenseDraftId: aiExpenseDraft._id,
      registrationMode: aiExpenseDraft.registrationMode ?? "detailed",
      itemName:
        aiExpenseDraft.registrationMode === "totalOnly"
          ? undefined
          : itemNames.length > 0
            ? itemNames.join("、")
            : entry.shopName,
    };
  }

  return {
    ...entry,
    receiptGroupId: `expenseEntry:${entry._id}`,
    receiptShopName: entry.shopName,
    receiptTotalAmountYen: entry.amountYen,
  };
}

export function enrichSpendingEntries(
  linkages: Array<{
    entry: SpendingEntry;
    sourceDocumentId?: string;
    aiExpenseDraftId?: string;
  }>,
  sourceDocumentMap: Map<string, EnrichSpendingEntrySourceDocument>,
  aiExpenseDraftMap: Map<string, EnrichSpendingEntryAiExpenseDraft>,
  aiExpenseDraftItemsMap: Map<string, EnrichSpendingEntryAiExpenseDraftItem[]>,
): SpendingEntry[] {
  return linkages.map(({ entry, sourceDocumentId, aiExpenseDraftId }) =>
    enrichSpendingEntry(entry, {
      sourceDocument: sourceDocumentId ? sourceDocumentMap.get(sourceDocumentId) : undefined,
      aiExpenseDraft: aiExpenseDraftId ? aiExpenseDraftMap.get(aiExpenseDraftId) : undefined,
      aiExpenseDraftItems: aiExpenseDraftId
        ? aiExpenseDraftItemsMap.get(aiExpenseDraftId)
        : undefined,
    }),
  );
}

/** エンリッチメント判定に必要な永続化ドキュメントの最小形状。 */
export type ReceiptEnrichmentSourceDocumentDoc = EnrichSpendingEntrySourceDocument & {
  groupId: string;
};

export type ReceiptEnrichmentAiExpenseDraftDoc = EnrichSpendingEntryAiExpenseDraft & {
  groupId: string;
};

export type ReceiptEnrichmentDraftItemDoc = {
  categoryId?: string;
  itemName?: string;
};

export type ReceiptEnrichmentMaps = {
  sourceDocumentMap: Map<string, EnrichSpendingEntrySourceDocument>;
  aiExpenseDraftMap: Map<string, EnrichSpendingEntryAiExpenseDraft>;
  aiExpenseDraftItemsMap: Map<string, EnrichSpendingEntryAiExpenseDraftItem[]>;
};

/**
 * レシートグループエンリッチメント用の参照mapを構築する。
 * 他グループのドキュメント・下書きは除外し、明細はカテゴリと品名が揃うものだけを使う。
 */
export function buildReceiptEnrichmentMaps(
  groupId: string,
  sourceDocuments: readonly (ReceiptEnrichmentSourceDocumentDoc | null)[],
  aiExpenseDrafts: readonly (ReceiptEnrichmentAiExpenseDraftDoc | null)[],
  aiExpenseDraftItems: ReadonlyArray<readonly [string, readonly ReceiptEnrichmentDraftItemDoc[]]>,
): ReceiptEnrichmentMaps {
  const sourceDocumentMap = new Map<string, EnrichSpendingEntrySourceDocument>();
  for (const document of sourceDocuments) {
    if (document !== null && document.groupId === groupId) {
      sourceDocumentMap.set(document._id, {
        _id: document._id,
        shopName: document.shopName,
        totalAmount: document.totalAmount,
      });
    }
  }

  const aiExpenseDraftMap = new Map<string, EnrichSpendingEntryAiExpenseDraft>();
  for (const draft of aiExpenseDrafts) {
    if (draft !== null && draft.groupId === groupId) {
      aiExpenseDraftMap.set(draft._id, {
        _id: draft._id,
        shopName: draft.shopName,
        payeeName: draft.payeeName,
        amountYen: draft.amountYen,
        registrationMode: draft.registrationMode,
      });
    }
  }

  const aiExpenseDraftItemsMap = new Map<string, EnrichSpendingEntryAiExpenseDraftItem[]>();
  for (const [draftId, items] of aiExpenseDraftItems) {
    aiExpenseDraftItemsMap.set(
      draftId,
      items
        .filter((item) => item.categoryId !== undefined && item.itemName !== undefined)
        .map((item) => ({
          categoryId: item.categoryId as string,
          itemName: item.itemName as string,
        })),
    );
  }

  return { sourceDocumentMap, aiExpenseDraftMap, aiExpenseDraftItemsMap };
}
