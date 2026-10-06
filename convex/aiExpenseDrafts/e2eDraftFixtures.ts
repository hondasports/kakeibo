import { unallocatedTaxReceipt } from "../../lib/domain/receipt/tax/fixtures/unallocatedTaxReceipt";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../../lib/domain/receipt/tax/fixtures/receiptTaxBasisCases";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type E2eTaxReviewReceiptCase =
  | "basis890"
  | "basis890_264"
  | "summary892"
  | "summary892_unknown"
  | "summary892_tax52"
  | "summary892_conflict10"
  | "summary892_conflictBoth";

export type DeleteDraftsByUserBatchArgs = {
  groupId: Id<"groups">;
  userId: string;
  limit?: number;
};

export type CreateE2eReadyDraftForUserArgs = {
  groupId: Id<"groups">;
  createdByUserId: string;
  categoryId: Id<"categories">;
  secondaryCategoryId?: Id<"categories">;
};

async function insertDraftItems(
  ctx: Pick<MutationCtx, "db">,
  groupId: Id<"groups">,
  draftId: Id<"aiExpenseDrafts">,
  items: Array<{
    itemName: string;
    amountYen: number;
    categoryId: Id<"categories">;
    confidence: {
      itemName?: number;
      amountYen?: number;
      categoryId?: number;
    };
  }>,
  now: number,
) {
  for (const item of items) {
    await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: item.itemName,
      amountYen: item.amountYen,
      categoryId: item.categoryId,
      confidence: item.confidence,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function deleteDraftsByUserBatchHandler(
  ctx: MutationCtx,
  args: DeleteDraftsByUserBatchArgs,
) {
  const limit = Math.min(Math.max(Math.floor(args.limit ?? 25), 1), 100);
  const drafts = await ctx.db
    .query("aiExpenseDrafts")
    .withIndex("by_group_id_and_created_by_user_id", (q) =>
      q.eq("groupId", args.groupId).eq("createdByUserId", args.userId),
    )
    .order("asc")
    .take(limit);

  let deletedDraftCount = 0;
  let deletedItemCount = 0;

  for (const draft of drafts) {
    const items = await ctx.db
      .query("aiExpenseDraftItems")
      .withIndex("by_group_id_and_draft_id", (q) =>
        q.eq("groupId", args.groupId).eq("draftId", draft._id),
      )
      .take(100);
    for (const item of items) {
      await ctx.db.delete(item._id);
      deletedItemCount += 1;
    }
    await ctx.db.delete(draft._id);
    deletedDraftCount += 1;
  }

  return {
    deletedDraftCount,
    deletedItemCount,
    hasMore: drafts.length === limit,
  };
}

export async function createE2eReadyDraftForUserHandler(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs,
) {
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "ready",
    documentType: "receipt",
    imageFileName: "e2e-issue-179-ready.png",
    shopName: "E2Eスーパー",
    date: "2026-06-01",
    amountYen: 1500,
    categoryId: args.categoryId,
    confidence: {
      documentType: 0.99,
      shopName: 0.99,
      date: 0.99,
      amountYen: 0.99,
      categoryId: 0.99,
    },
    warnings: [],
    reviewReasons: [],
    createdAt: now,
    updatedAt: now,
  });

  await insertDraftItems(
    ctx,
    args.groupId,
    draftId,
    [
      {
        itemName: "E2E項目-食料品",
        amountYen: 700,
        categoryId: args.categoryId,
        confidence: {
          itemName: 0.99,
          amountYen: 0.99,
          categoryId: 0.99,
        },
      },
      {
        itemName: "E2E項目-パン",
        amountYen: 300,
        categoryId: args.categoryId,
        confidence: {
          itemName: 0.99,
          amountYen: 0.99,
          categoryId: 0.99,
        },
      },
      {
        itemName: "E2E項目-日用品",
        amountYen: 500,
        categoryId: args.secondaryCategoryId ?? args.categoryId,
        confidence: {
          itemName: 0.99,
          amountYen: 0.99,
          categoryId: 0.99,
        },
      },
    ],
    now,
  );

  return draftId;
}

export async function createE2eTaxReviewDraftForUserHandler(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs & { receiptCase?: E2eTaxReviewReceiptCase },
) {
  if (
    args.receiptCase === "summary892" ||
    args.receiptCase === "summary892_unknown" ||
    args.receiptCase === "summary892_tax52" ||
    args.receiptCase === "summary892_conflict10" ||
    args.receiptCase === "summary892_conflictBoth"
  )
    return createE2eSummaryReviewDraft(ctx, args);
  if (args.receiptCase !== undefined)
    return createE2eCrossBasisTaxDraft(ctx, { ...args, receiptCase: args.receiptCase });
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    imageFileName: "e2e-tax-review.png",
    shopName: "E2E税レビュー店",
    date: "2026-07-04",
    amountYen: 108,
    categoryId: args.categoryId,
    confidence: {
      documentType: 1,
      shopName: 1,
      date: 1,
      amountYen: 1,
      categoryId: 1,
    },
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "external",
        taxableAmountYen: 100,
        taxableAmountBasis: "tax_excluded",
        taxYen: 8,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
    ],
    rawObservation: {
      source: "ai_ocr",
      observedAt: now,
      lines: [
        {
          rawText: "E2E税テスト商品 100円",
          amountText: "100円",
          amountYen: 100,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.99,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
          boundingBox: { left: 0.08, top: 0.24, width: 0.84, height: 0.08 },
        },
      ],
    },
    warnings: ["unresolved_tax_rate:items[0]"],
    reviewReasons: ["user_confirmation_required", "amount_mismatch"],
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("aiExpenseDraftItems", {
    groupId: args.groupId,
    draftId,
    itemName: "E2E税テスト商品",
    amountYen: 100,
    printedAmountYen: 100,
    categoryId: args.categoryId,
    confidence: {
      itemName: 1,
      amountYen: 1,
      categoryId: 1,
    },
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["unresolved_tax_rate"],
    createdAt: now,
    updatedAt: now,
  });

  return draftId;
}

async function createE2eSummaryReviewDraft(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs & { receiptCase?: E2eTaxReviewReceiptCase },
) {
  const now = Date.now();
  const tenPercentConflict =
    args.receiptCase === "summary892_conflict10" || args.receiptCase === "summary892_conflictBoth";
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "E2E税内訳補完店",
    date: "2026-10-05",
    amountYen: 1782,
    categoryId: args.categoryId,
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: args.receiptCase === "summary892_unknown" ? "unknown" : "external",
        taxableAmountYen: args.receiptCase === "summary892_conflictBoth" ? 668 : 669,
        taxableAmountBasis: "unknown",
        taxYen: args.receiptCase === "summary892_tax52" ? 52 : 53,
        ...(args.receiptCase === "summary892_unknown" ? { taxIncludedAmountYen: 722 } : {}),
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
        status: "ambiguous",
        reasons: ["unresolved_tax_summary"],
      },
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountYen: 1060,
        taxableAmountBasis: tenPercentConflict ? "tax_excluded" : "tax_included",
        taxYen: 96,
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
        status: tenPercentConflict ? "contradictory" : "verified",
      },
    ],
    rawObservation: {
      source: "ai_ocr",
      observedAt: now,
      lines: [
        {
          rawText: "合計 1,782円",
          amountText: "1,782円",
          amountYen: 1782,
          lineRoleCandidates: ["total"],
          roleConfidence: 1,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
        },
      ],
    },
    warnings: [],
    reviewReasons: [],
    createdAt: now,
    updatedAt: now,
  });
  for (const [index, amountYen] of [95, 1060, 128, 99, 99, 248].entries()) {
    await ctx.db.insert("aiExpenseDraftItems", {
      groupId: args.groupId,
      draftId,
      itemName: index === 1 ? "日用品" : `食品${index}`,
      amountYen,
      printedAmountYen: amountYen,
      amountBasis: index === 1 ? "tax_included" : "tax_excluded",
      taxRatePercent: index === 1 ? 10 : 8,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      categoryId: args.categoryId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: now,
      updatedAt: now,
    });
  }
  return draftId;
}

async function createE2eCrossBasisTaxDraft(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs & { receiptCase?: "basis890" | "basis890_264" },
) {
  const testCase = receiptTaxBasisCases[args.receiptCase === "basis890_264" ? 2 : 0];
  const input = receiptTaxBasisInput(testCase);
  const subtotalYen = testCase.amounts.reduce((sum, amount) => sum + amount, 0);
  const now = Date.now();
  const observations = [
    ...input.items.map((item) => ({
      rawText: `${item.itemName} ${item.printedAmountYen}円`,
      amountYen: item.printedAmountYen,
      role: "item" as const,
    })),
    { rawText: `小計${subtotalYen}円`, amountYen: subtotalYen, role: "subtotal" as const },
    { rawText: `外税8% ${testCase.taxYen}円`, amountYen: testCase.taxYen, role: "tax" as const },
    { rawText: `合計${testCase.paidYen}円`, amountYen: testCase.paidYen, role: "total" as const },
    {
      rawText: `税率8%対象額${testCase.paidYen}円`,
      amountYen: testCase.paidYen,
      role: "tax" as const,
    },
    {
      rawText: `内消費税等8% ${testCase.taxYen}円`,
      amountYen: testCase.taxYen,
      role: "tax" as const,
    },
  ];
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    imageFileName: `e2e-tax-basis-890-${testCase.paidYen}.png`,
    shopName: `E2E税基準確認店${testCase.paidYen}`,
    date: "2026-10-04",
    amountYen: input.amountYen,
    categoryId: args.categoryId,
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    taxSummaries: input.taxSummaries,
    rawObservation: {
      source: "ai_ocr",
      observedAt: now,
      lines: observations.map((line, sourceLineIndex) => ({
        rawText: line.rawText,
        amountText: `${line.amountYen}円`,
        amountYen: line.amountYen,
        lineRoleCandidates: [line.role],
        roleConfidence: 0.99,
        explicitlyPrinted: true,
        sourceLineIndex,
      })),
    },
    warnings: [],
    reviewReasons: ["user_confirmation_required", "amount_mismatch"],
    createdAt: now,
    updatedAt: now,
  });
  for (const item of input.items) {
    await ctx.db.insert("aiExpenseDraftItems", {
      groupId: args.groupId,
      draftId,
      itemName: item.itemName,
      amountYen: item.printedAmountYen,
      printedAmountYen: item.printedAmountYen,
      amountBasis: "tax_included",
      taxRatePercent: 8,
      allocatedTaxYen: 0,
      taxAllocationStatus: "unallocated",
      normalizedAmountYen: item.printedAmountYen,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      categoryId: args.categoryId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      warnings: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return draftId;
}

export async function createE2eMixedTaxReviewDraftForUserHandler(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs,
) {
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    imageFileName: "e2e-mixed-tax-review.png",
    shopName: "E2E混在税レビュー店",
    date: "2026-07-06",
    amountYen: 438,
    categoryId: args.categoryId,
    confidence: {
      documentType: 1,
      shopName: 1,
      date: 1,
      amountYen: 1,
      categoryId: 1,
    },
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "included",
        taxableAmountYen: 218,
        taxableAmountBasis: "tax_included",
        taxYen: 16,
        taxIncludedAmountYen: 218,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountYen: 220,
        taxableAmountBasis: "tax_included",
        taxYen: 20,
        taxIncludedAmountYen: 220,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
    ],
    rawObservation: {
      source: "ai_ocr",
      observedAt: now,
      lines: [
        {
          rawText: "パン 108円 ※",
          amountText: "108円",
          amountYen: 108,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.99,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
          boundingBox: { left: 0.08, top: 0.18, width: 0.84, height: 0.08 },
        },
        {
          rawText: "洗剤 110円",
          amountText: "110円",
          amountYen: 110,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.99,
          explicitlyPrinted: true,
          sourceLineIndex: 1,
          boundingBox: { left: 0.08, top: 0.28, width: 0.84, height: 0.08 },
        },
        {
          rawText: "牛乳 110円",
          amountText: "110円",
          amountYen: 110,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.7,
          explicitlyPrinted: true,
          sourceLineIndex: 2,
          boundingBox: { left: 0.08, top: 0.38, width: 0.84, height: 0.08 },
        },
        {
          rawText: "ラップ 110円",
          amountText: "110円",
          amountYen: 110,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.7,
          explicitlyPrinted: true,
          sourceLineIndex: 3,
          boundingBox: { left: 0.08, top: 0.48, width: 0.84, height: 0.08 },
        },
      ],
    },
    warnings: ["unresolved_tax_rate:items[2]", "unresolved_tax_rate:items[3]"],
    reviewReasons: ["user_confirmation_required"],
    createdAt: now,
    updatedAt: now,
  });

  const common = {
    groupId: args.groupId,
    draftId,
    categoryId: args.categoryId,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: now,
    updatedAt: now,
  };
  await ctx.db.insert("aiExpenseDraftItems", {
    ...common,
    itemName: "パン",
    amountYen: 108,
    printedAmountYen: 108,
    amountBasis: "tax_included",
    taxRatePercent: 8,
    allocatedTaxYen: 8,
    normalizedAmountYen: 108,
    taxResolutionStatus: "resolved",
    taxResolutionSource: "marker_reconciled",
  });
  await ctx.db.insert("aiExpenseDraftItems", {
    ...common,
    itemName: "洗剤",
    amountYen: 110,
    printedAmountYen: 110,
    amountBasis: "tax_included",
    taxRatePercent: 10,
    allocatedTaxYen: 10,
    normalizedAmountYen: 110,
    taxResolutionStatus: "resolved",
    taxResolutionSource: "summary_reconciliation",
  });
  await ctx.db.insert("aiExpenseDraftItems", {
    ...common,
    itemName: "牛乳",
    amountYen: 110,
    printedAmountYen: 110,
    amountBasis: "unknown",
    taxRatePercent: null,
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["unresolved_tax_rate"],
  });
  await ctx.db.insert("aiExpenseDraftItems", {
    ...common,
    itemName: "ラップ",
    amountYen: 110,
    printedAmountYen: 110,
    amountBasis: "unknown",
    taxRatePercent: null,
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["unresolved_tax_rate"],
  });

  return draftId;
}

export async function createE2eTaxSummaryConflictDraftForUserHandler(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs,
) {
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    imageFileName: "e2e-tax-summary-conflict.png",
    shopName: "E2E税率別集計店",
    date: "2026-07-05",
    amountYen: 1060,
    categoryId: args.categoryId,
    confidence: {
      documentType: 1,
      shopName: 1,
      date: 1,
      amountYen: 1,
      categoryId: 1,
    },
    taxSummaries: [
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountYen: 960,
        taxableAmountBasis: "tax_excluded",
        taxYen: 96,
        taxIncludedAmountYen: 1050,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
        status: "conflicting",
        reasons: ["included_mode_with_tax_excluded_basis", "tax_included_amount_mismatch"],
      },
    ],
    warnings: ["tax_summary_amount_mismatch"],
    reviewReasons: ["user_confirmation_required", "amount_mismatch"],
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("aiExpenseDraftItems", {
    groupId: args.groupId,
    draftId,
    itemName: "E2E税率別集計商品",
    amountYen: 1060,
    printedAmountYen: 1060,
    categoryId: args.categoryId,
    confidence: {
      itemName: 1,
      amountYen: 1,
      categoryId: 1,
    },
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["unresolved_tax_rate"],
    createdAt: now,
    updatedAt: now,
  });

  return draftId;
}

export async function createE2eUnallocatedTaxDraftForUserHandler(
  ctx: MutationCtx,
  args: CreateE2eReadyDraftForUserArgs,
) {
  const fixture = unallocatedTaxReceipt();
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: args.groupId,
    createdByUserId: args.createdByUserId,
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "E2E税配分確認店",
    date: "2026-09-09",
    amountYen: fixture.amountYen,
    categoryId: args.categoryId,
    registrationMode: "detailed",
    taxSummaries: fixture.taxSummaries,
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    reviewReasons: ["amount_mismatch"],
    createdAt: now,
    updatedAt: now,
  });
  for (const item of fixture.items) {
    await ctx.db.insert("aiExpenseDraftItems", {
      ...item,
      groupId: args.groupId,
      draftId,
      amountYen: item.printedAmountYen!,
      lineType: item.printedAmountYen! < 0 ? "discount" : "item",
      categoryId: args.categoryId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: now,
      updatedAt: now,
    });
  }
  return draftId;
}
