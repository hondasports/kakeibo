import type { Id } from "../_generated/dataModel";
import { registerReadyDraftsHandler } from "./mutations";
import { describe, expect, it, vi } from "vitest";
import {
  GROUP_ID,
  OTHER_GROUP_ID,
  createIdentity,
  createMutationCtx,
  readyDraft,
} from "./testHelpers";

describe("aiExpenseDrafts (register) (batch registration)", () => {
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
});
