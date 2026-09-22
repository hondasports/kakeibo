import type { Id } from "../_generated/dataModel";
import { registerReadyDraftsAsExpenseEntriesHandler } from "./mutations";
import {
  DraftDoc,
  DraftItemDoc,
  GROUP_ID,
  OTHER_GROUP_ID,
  createIdentity,
  createMutationCtx,
  mixedCategoryDraftItems,
  readyDraft,
  readyDraftItems,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

describe("aiExpenseDrafts (registerReady)", () => {
  describe("registerReadyDraftsAsExpenseEntries", () => {
    it("明細ありのready下書きはカテゴリ別に集約してexpenseEntriesに登録できる", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1380,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-medical": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-food", "entry-medical"],
        items: mixedCategoryDraftItems,
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.registeredDraftIds).toContain("draft-ready");
      expect(result.createdExpenseEntryIds).toHaveLength(2);
      expect(result.createdExpenseEntryIds).toEqual(["entry-food", "entry-medical"]);
      expect(ctx.db.insert).toHaveBeenCalledTimes(2);
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        1,
        "expenseEntries",
        expect.objectContaining({
          amount: 400,
          aiExpenseDraftId: "draft-ready",
          categoryId: "cat-food",
          date: "2026-06-01",
          source: "ai_suggested",
        }),
      );
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        2,
        "expenseEntries",
        expect.objectContaining({
          amount: 980,
          aiExpenseDraftId: "draft-ready",
          categoryId: "cat-medical",
          date: "2026-06-01",
          source: "ai_suggested",
        }),
      );
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "draft-ready",
        expect.objectContaining({
          status: "registered",
          derivedRegistration: expect.objectContaining({
            source: "derived",
            destination: "expense_entries",
            amountYen: 1380,
            categoryIds: ["cat-food", "cat-medical"],
          }),
        }),
      );
    });

    it("割引明細を同じカテゴリから減額して正味額で登録する", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 2189,
          },
          "cat-other": { groupId: GROUP_ID, isActive: true },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-daily": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-other", "entry-food", "entry-daily"],
        items: [
          {
            ...readyDraftItems[0],
            _id: "item-tobacco",
            itemName: "キャメル・メンソール・コ（2個）",
            amountYen: 1060,
            categoryId: "cat-other",
          },
          {
            ...readyDraftItems[0],
            _id: "item-food",
            itemName: "マルちゃん ごつ盛 塩",
            amountYen: 139,
            categoryId: "cat-food",
          },
          {
            ...readyDraftItems[0],
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
          },
          {
            ...readyDraftItems[0],
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          },
        ],
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-other", "entry-food", "entry-daily"]);
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        3,
        "expenseEntries",
        expect.objectContaining({ amount: 990, categoryId: "cat-daily" }),
      );
    });

    it("割引後のカテゴリ正味額が0円以下なら登録しない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 100,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-daily": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          {
            ...readyDraftItems[0],
            amountYen: 200,
            categoryId: "cat-food",
          },
          {
            ...readyDraftItems[1],
            amountYen: 100,
            categoryId: "cat-daily",
          },
          {
            ...readyDraftItems[1],
            _id: "item-discount",
            itemName: "クーポン券割引",
            amountYen: -200,
            categoryId: "cat-daily",
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft category total must be greater than zero" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it("明細なしのready下書きは既存どおり単一expenseEntryに登録できる", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": readyDraft,
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-1"],
        items: [],
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-1"]);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({
          amount: 1200,
          categoryId: "cat-food",
          title: "スーパー青葉",
        }),
      );
    });

    it("未分類の明細があるready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1500,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          readyDraftItems[0],
          {
            ...readyDraftItems[1],
            categoryId: undefined,
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft item category is required to register" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("明細合計と下書き合計が一致しないready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 9999,
            taxRatePercent: null,
            taxableAmountYen: null,
            taxYen: null,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: readyDraftItems,
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft item total must match draft amount" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("totalOnlyはユーザー確認済み合計を1件だけ登録し明細不一致を集計へ入れない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 9999,
            registrationMode: "totalOnly",
            receiptTotalResolution: {
              status: "verified",
              protectedAmountYen: 9999,
              candidates: [
                {
                  amountYen: 9999,
                  source: "user_confirmed",
                  evidence: "review.amountYen",
                },
              ],
              reasons: [],
            },
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-total"],
        items: readyDraftItems,
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-total"]);
      expect(ctx.db.insert).toHaveBeenCalledTimes(1);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({ amount: 9999, categoryId: "cat-food" }),
      );
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "draft-ready",
        expect.objectContaining({
          derivedRegistration: expect.objectContaining({
            registrationMode: "totalOnly",
            amountYen: 9999,
            categoryIds: ["cat-food"],
          }),
        }),
      );
    });

    it("totalOnlyはAI推定だけの合計を登録しない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            registrationMode: "totalOnly",
            receiptTotalResolution: {
              status: "ambiguous",
              protectedAmountYen: 1200,
              candidates: [],
              reasons: [],
            },
          },
        },
        items: readyDraftItems,
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({
        data: "Receipt total must be confirmed before total-only registration",
      });
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it("低信頼度の明細が残るready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1500,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          readyDraftItems[0],
          {
            ...readyDraftItems[1],
            confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.7 },
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({
        data: "Low confidence draft items must be reviewed before register",
      });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("既にregisteredの下書きはスキップする", async () => {
      const registeredDraft: DraftDoc = {
        ...readyDraft,
        _id: "draft-registered",
        status: "registered",
      };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-registered": registeredDraft },
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-registered" as Id<"aiExpenseDrafts">],
      });

      expect(result.registeredDraftIds).toHaveLength(0);
      expect(result.alreadyRegisteredDraftIds).toContain("draft-registered");
    });

    it("ready状態でない下書きはエラー", async () => {
      const needsReviewDraft = { ...readyDraft, status: "needs_review" as const };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-needs-review": needsReviewDraft },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-needs-review" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("他グループの下書きはエラー", async () => {
      const otherUserDraft = { ...readyDraft, groupId: OTHER_GROUP_ID };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-ready": otherUserDraft },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("存在しない下書きはエラー", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-missing": null },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-missing" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("itemsが空で必須値不足のready下書きはエラー", async () => {
      const invalidReadyDraft: DraftDoc = {
        ...readyDraft,
        amountYen: undefined,
        categoryId: undefined,
      };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-ready": invalidReadyDraft },
        items: [],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("101件以上の明細を持つready下書きも全件を集約して登録できる", async () => {
      const manyItems: DraftItemDoc[] = Array.from({ length: 101 }, (_, index) => ({
        _id: `draft-item-${index}` as Id<"aiExpenseDraftItems">,
        _creationTime: index,
        groupId: GROUP_ID,
        draftId: "draft-ready",
        itemName: `商品${index}`,
        amountYen: 10,
        categoryId: index % 2 === 0 ? "cat-food" : "cat-medical",
        confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
        createdAt: index,
        updatedAt: index,
      }));
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": { ...readyDraft, amountYen: 1010 },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-medical": { groupId: GROUP_ID, isActive: true },
        },
        items: manyItems,
        insertedIds: ["entry-food", "entry-medical"],
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.registeredDraftIds).toContain("draft-ready");
      expect(result.createdExpenseEntryIds).toHaveLength(2);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({ categoryId: "cat-food", amount: 510 }),
      );
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({ categoryId: "cat-medical", amount: 500 }),
      );
    });
  });
});
