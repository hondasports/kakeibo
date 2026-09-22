import type { Id } from "../_generated/dataModel";
import { registerReadyDraftsHandler, updateForReviewHandler } from "./mutations";
import {
  GROUP_ID,
  OTHER_GROUP_ID,
  createIdentity,
  createMutationCtx,
  ownedDraft,
  readyDraft,
} from "./testHelpers";
import { describe, expect, it, vi } from "vitest";

describe("aiExpenseDrafts (register)", () => {
  it("101件の確認済み非課税明細を切り捨てず登録する", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      _id: "item-" + index,
      _creationTime: index,
      groupId: GROUP_ID,
      draftId: "draft-ready",
      itemName: "商品",
      amountYen: 1,
      printedAmountYen: 1,
      normalizedAmountYen: 1,
      amountBasis: "tax_included",
      taxRatePercent: 0,
      taxAllocationStatus: "allocated",
      categoryId: "cat-food",
      confidence: {},
      createdAt: 0,
      updatedAt: 0,
    }));
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": { ...readyDraft, amountYen: 101 },
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
      items,
      insertedIds: ["receipt-101"],
    });
    await expect(
      registerReadyDraftsHandler(ctx, { draftIds: ["draft-ready" as Id<"aiExpenseDrafts">] }),
    ).resolves.toMatchObject({ registeredReceiptIds: ["receipt-101"] });
  });

  it("登録準備OKの下書きを receipts としてまとめて登録し、下書きを registered に更新する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-payment": {
          ...readyDraft,
          _id: "draft-payment",
          documentType: "convenience_payment",
          shopName: "セブンイレブン",
          payeeName: "東京都",
          paymentPurpose: "自動車税",
          amountYen: 39100,
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["receipt-001", "receipt-002"],
    });

    const result = await registerReadyDraftsHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftIds: ["draft-ready", "draft-payment"] as any,
    });

    expect(result).toEqual({
      registeredDraftIds: ["draft-ready", "draft-payment"],
      registeredReceiptIds: ["receipt-001", "receipt-002"],
      alreadyRegisteredDraftIds: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenNthCalledWith(
      1,
      "receipts",
      expect.objectContaining({
        groupId: GROUP_ID,
        date: "2026-06-01",
        type: "expense",
        shopName: "スーパー青葉",
        amountYen: 1200,
        categoryId: "cat-food",
      }),
    );
    expect(dbInsert).toHaveBeenNthCalledWith(
      2,
      "receipts",
      expect.objectContaining({
        shopName: "東京都 自動車税",
        amountYen: 39100,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledTimes(2);
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        status: "registered",
        registeredReceiptId: "receipt-001",
        derivedRegistration: expect.objectContaining({
          source: "derived",
          destination: "receipt",
          amountYen: 1200,
          categoryIds: ["cat-food"],
        }),
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-payment",
      expect.objectContaining({
        status: "registered",
        registeredReceiptId: "receipt-002",
      }),
    );
  });

  it("すでに登録済みの下書きは再登録せず、未登録の ready 下書きだけ登録する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-registered": {
          ...readyDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-already",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["receipt-003"],
    });

    const result = await registerReadyDraftsHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftIds: ["draft-ready", "draft-registered", "draft-ready"] as any,
    });

    expect(result).toEqual({
      registeredDraftIds: ["draft-ready"],
      registeredReceiptIds: ["receipt-003"],
      alreadyRegisteredDraftIds: ["draft-registered"],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledTimes(1);
  });

  it("ready 以外の下書きが含まれる場合はまとめて登録を拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-review": {
          ...readyDraft,
          _id: "draft-review",
          status: "needs_review",
          reviewReasons: ["low_confidence"],
        },
      },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftIds: ["draft-ready", "draft-review"] as any,
      }),
    ).rejects.toMatchObject({ data: "Only ready drafts can be registered" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("他ユーザーの下書きはまとめて登録できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...readyDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftIds: ["draft-other"] as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  it("登録対象が空なら何もせず空の結果を返す", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(registerReadyDraftsHandler(ctx, { draftIds: [] })).resolves.toEqual({
      registeredDraftIds: [],
      registeredReceiptIds: [],
      alreadyRegisteredDraftIds: [],
    });
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("存在しない下書きの登録は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-missing": null },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        draftIds: ["draft-missing" as Id<"aiExpenseDrafts">],
      }),
    ).rejects.toMatchObject({ data: "AI expense draft not found" });
  });

  it("確認が必要な下書きを編集して登録準備OKへ戻す", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "receipt",
      shopName: "スーパー青葉 北浜店",
      paymentPlace: "北浜",
      payeeName: "スーパー青葉",
      paymentPurpose: "食料品",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        shopName: "スーパー青葉 北浜店",
        paymentPlace: "北浜",
        payeeName: "スーパー青葉",
        paymentPurpose: "食料品",
        date: "2026-06-02",
        amountYen: 1680,
        categoryId: "cat-food",
      }),
    );
  });

  it("確認下書きの明細を置き換えて登録準備OKへ戻す", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      items: [
        {
          _id: "old-item-1",
          _creationTime: 1,
          groupId: GROUP_ID,
          draftId: "draft-owned",
          itemName: "古い明細",
          amountYen: 100,
          categoryId: "cat-food",
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      insertedIds: ["new-item-1", "new-item-2"],
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1380,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
      items: [
        {
          itemName: "パン",
          amountYen: 400,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "cat-food" as any,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          warnings: [],
        },
        {
          itemName: "胃薬",
          amountYen: 980,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "cat-food" as any,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          warnings: [],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbDelete = (ctx.db as any).delete as ReturnType<typeof vi.fn>;
    expect(dbDelete).toHaveBeenCalledWith("old-item-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        draftId: "draft-owned",
        itemName: "パン",
        amountYen: 400,
        categoryId: "cat-food",
      }),
    );
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        draftId: "draft-owned",
        itemName: "胃薬",
        amountYen: 980,
        categoryId: "cat-food",
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
  });

  it("確認下書きの割引明細を負数で保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-daily": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["new-item-1", "new-item-2"],
    });

    await updateForReviewHandler(ctx, {
      draftId: "draft-owned" as Id<"aiExpenseDrafts">,
      documentType: "receipt",
      shopName: "クスリキリン堂 稲美店",
      date: "2026-06-29",
      amountYen: 990,
      categoryId: "cat-daily" as Id<"categories">,
      items: [
        {
          itemName: "キュレル ジェルメイク",
          amountYen: 1100,
          categoryId: "cat-daily" as Id<"categories">,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
        {
          itemName: "クーポン券割引 10%",
          amountYen: -110,
          categoryId: "cat-daily" as Id<"categories">,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "クーポン券割引 10%",
        amountYen: -110,
        categoryId: "cat-daily",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({ status: "ready", reviewReasons: [] }),
    );
  });

  it("他ユーザーの確認下書きは編集できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-other" as any,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-food" as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  it("書類種別が未判定の確認下書きは登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-owned" as any,
        documentType: "unknown",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-food" as any,
      }),
    ).rejects.toMatchObject({ data: "Draft document type must be selected to mark ready" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("実在しない支出日の確認下書きは登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        draftId: "draft-owned" as Id<"aiExpenseDrafts">,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-02-30",
        amountYen: 1680,
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toMatchObject({ data: "Draft date must be a valid YYYY-MM-DD date" });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("登録準備OK状態の下書きはレビュー編集できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...ownedDraft,
          _id: "draft-ready",
          status: "ready",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-ready" as any,
      documentType: "receipt",
      shopName: "スーパー青葉 北浜店",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        shopName: "スーパー青葉 北浜店",
      }),
    );
  });

  it("登録済みの下書きは同じexpenseEntryを再利用してレビュー編集できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...ownedDraft,
          _id: "draft-registered",
          status: "registered",
          categoryId: "cat-food",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      expenseEntries: [{ _id: "entry-existing", groupId: GROUP_ID, categoryId: "cat-food" }],
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-registered" as any,
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(patch).toHaveBeenCalledWith(
      "entry-existing",
      expect.objectContaining({ categoryId: "cat-food", source: "ai_suggested" }),
    );
    expect((ctx.db as any).insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("legacy receiptへ登録済みの下書きはexpenseEntryへ二重登録しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...readyDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-1",
        },
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        draftId: "draft-registered" as Id<"aiExpenseDrafts">,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toMatchObject({
      data: "Legacy receipt registrations cannot be edited from the AI queue",
    });
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("払込票は統合した店名・内容で登録準備OKへ戻せる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "convenience_payment",
      shopName: "大阪市水道局 水道料金",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        shopName: "大阪市水道局 水道料金",
        paymentPlace: undefined,
        payeeName: undefined,
        paymentPurpose: undefined,
      }),
    );
  });

  it("無効化済みカテゴリでは確認下書きを登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-inactive": {
          groupId: GROUP_ID,
          isActive: false,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-owned" as any,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-inactive" as any,
      }),
    ).rejects.toMatchObject({ data: "Inactive category cannot be used for reviewed drafts" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
