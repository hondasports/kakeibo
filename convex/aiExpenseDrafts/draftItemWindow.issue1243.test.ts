/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { persistReceiptUserOverrideSnapshot } from "../../lib/convex/aiExpenseDrafts/receiptDataContract";
import { withEnv, VALID_IMAGE_DATA_URL } from "../receiptAnalysisJobs/testHelpers";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const userId = "registration-mode-user";
const identity = {
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
};

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "家計簿",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId,
      displayName: "テストユーザー",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const foodId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#f97316",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const dailyId = await ctx.db.insert("categories", {
      groupId,
      name: "日用品",
      color: "#0ea5e9",
      isActive: true,
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const draftId = await ctx.db.insert("aiExpenseDrafts", {
      groupId,
      createdByUserId: userId,
      sourceType: "image_upload",
      status: "registered",
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-08-26",
      amountYen: 1200,
      categoryId: foodId,
      registrationMode: "detailed",
      confidence: { documentType: 1, amountYen: 1, categoryId: 1 },
      reviewReasons: [],
      derivedRegistration: {
        source: "derived",
        destination: "expense_entries",
        registrationMode: "detailed",
        amountYen: 1200,
        date: "2026-08-26",
        categoryIds: [foodId, dailyId],
        registeredAt: 1,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    const foodItemId = await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: "食品",
      amountYen: 400,
      categoryId: foodId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    });
    const dailyItemId = await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: "日用品",
      amountYen: 800,
      categoryId: dailyId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [amount, categoryId, title] of [
      [400, foodId, "食品"],
      [800, dailyId, "日用品"],
    ] as const) {
      await ctx.db.insert("expenseEntries", {
        groupId,
        createdByUserId: userId,
        aiExpenseDraftId: draftId,
        date: "2026-08-26",
        amount,
        categoryId,
        title,
        entryType: "expense",
        source: "ai_suggested",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    return { groupId, foodId, dailyId, draftId, foodItemId, dailyItemId };
  });
}

describe("判定窓を超える下書きの保存", () => {
  it.each(["updateForReview", "updateRegisteredDraft"] as const)(
    "%s は101件の明細を保持して拒否する",
    async (operation) => {
      const t = convexTest(schema, convexTestModules);
      const ids = await seed(t);
      await t.run(async (ctx) => {
        if (operation === "updateForReview")
          await ctx.db.patch(ids.draftId, {
            status: "needs_review",
            reviewReasons: ["amount_mismatch"],
          });
        for (let i = 2; i < 101; i++)
          await ctx.db.insert("aiExpenseDraftItems", {
            groupId: ids.groupId,
            draftId: ids.draftId,
            itemName: `明細${i}`,
            amountYen: 1,
            categoryId: ids.foodId,
            confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
            createdAt: 1,
            updatedAt: 1,
          });
      });
      const before = await t.run((ctx) => ctx.db.get(ids.draftId));
      const common = {
        draftId: ids.draftId,
        date: "2026-08-26",
        amountYen: 1200,
        categoryId: ids.foodId,
        shopName: "スーパー青葉",
        registrationMode: "detailed" as const,
        items: [
          { itemId: ids.foodItemId, itemName: "食品", amountYen: 1200, categoryId: ids.foodId },
        ],
      };
      const call =
        operation === "updateForReview"
          ? t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
              ...common,
              documentType: "receipt",
            })
          : t
              .withIdentity(identity)
              .mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, common);
      await expect(call).rejects.toThrow("Draft contains more than 100 items");
      const after = await t.run(async (ctx) => ({
        draft: await ctx.db.get(ids.draftId),
        items: await ctx.db
          .query("aiExpenseDraftItems")
          .withIndex("by_group_id_and_draft_id", (q) =>
            q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
          )
          .collect(),
      }));
      expect(after.items).toHaveLength(101);
      expect(after.draft?.status).toEqual(before?.status);
      expect(after.draft?.reviewReasons).toEqual(before?.reviewReasons);
    },
  );
});

it("修正済み101件の再解析は明細を維持する", async () => {
  await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const jobId = await t.run(async (ctx) => {
      const user = await ctx.db.query("users").first();
      await ctx.db.patch(user!._id, { receiptImageExternalApiConsentAcceptedAt: 1 });
      const snapshots = Array.from({ length: 100 }, (_, i) => ({
        itemName: `修正${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      }));
      await ctx.db.patch(ids.draftId, {
        status: "needs_review",
        receiptUserOverride: {
          source: "user",
          updatedAt: 1,
          fields: ["items"],
          values: {
            status: "needs_review",
            documentType: "receipt",
            confidence: {},
            warnings: [],
            reviewReasons: [],
            items: snapshots,
          },
        },
      });
      for (let i = 2; i < 101; i++)
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId: ids.groupId,
          draftId: ids.draftId,
          itemName: `修正${i}`,
          amountYen: 1,
          categoryId: ids.foodId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId: ids.groupId,
        totalCount: 1,
        processedCount: 1,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      return ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId: ids.groupId,
        imageIndex: 0,
        fileName: "receipt.jpg",
        status: "queued",
        draftId: ids.draftId,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t.withIdentity(identity).action(api.receiptAnalysisJobs.actions.analyzeImageJob, {
        jobId,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      }),
    ).rejects.toThrow("Draft contains more than 100 items");
    const result = await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      const items = await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("draftId", job!.draftId!),
        )
        .collect();
      return { job, items };
    });
    expect(result.job?.draftId).toBe(ids.draftId);
    expect(result.job?.status).toBe("queued");
    expect(result.items).toHaveLength(101);
  });
});

it("snapshot は101件の明細を切り詨てず拒否する", async () => {
  const t = convexTest(schema, convexTestModules);
  const ids = await seed(t);
  await t.run(async (ctx) => {
    for (let i = 2; i < 101; i++)
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: ids.groupId,
        draftId: ids.draftId,
        itemName: `明細${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
  });
  await expect(
    t.run((ctx) =>
      persistReceiptUserOverrideSnapshot(ctx, {
        draftId: ids.draftId,
        groupId: ids.groupId,
        fields: ["items"],
      }),
    ),
  ).rejects.toThrow("Draft contains more than 100 items");
});

it.each(["updateForReview", "updateRegisteredDraft"] as const)(
  "%s は100件の下書きを保存できる",
  async (operation) => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      if (operation === "updateForReview")
        await ctx.db.patch(ids.draftId, { status: "needs_review" });
      for (let i = 2; i < 100; i++)
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId: ids.groupId,
          draftId: ids.draftId,
          itemName: `明細${i}`,
          amountYen: 1,
          categoryId: ids.foodId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
    });
    const common = {
      draftId: ids.draftId,
      date: "2026-08-26",
      amountYen: 1200,
      categoryId: ids.foodId,
      shopName: "スーパー青葉",
      registrationMode: "detailed" as const,
      items: [
        { itemId: ids.foodItemId, itemName: "食品", amountYen: 1200, categoryId: ids.foodId },
      ],
    };
    if (operation === "updateForReview")
      await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        ...common,
        documentType: "receipt",
      });
    else
      await t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, common);
    const items = await t.run((ctx) =>
      ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
        )
        .collect(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].amountYen).toBe(1200);
  },
);

it("snapshot は事前取得済み明細が渡されても DB の101件を拒否する", async () => {
  const t = convexTest(schema, convexTestModules);
  const ids = await seed(t);
  await t.run(async (ctx) => {
    for (let i = 2; i < 101; i++)
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: ids.groupId,
        draftId: ids.draftId,
        itemName: `明細${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
  });
  await expect(
    t.run((ctx) =>
      persistReceiptUserOverrideSnapshot(ctx, {
        draftId: ids.draftId,
        groupId: ids.groupId,
        fields: ["items"],
        items: [],
      }),
    ),
  ).rejects.toThrow("Draft contains more than 100 items");
});

it("再解析の準備は101件を拒否しジョブを待機状態にしない", async () => {
  const t = convexTest(schema, convexTestModules);
  const ids = await seed(t);
  const jobId = await t.run(async (ctx) => {
    for (let i = 2; i < 101; i++) {
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: ids.groupId,
        draftId: ids.draftId,
        itemName: `明細${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const batchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId: ids.groupId,
      totalCount: 1,
      processedCount: 1,
      status: "completed",
      createdAt: 1,
      updatedAt: 1,
    });
    return ctx.db.insert("receiptAnalysisImageJobs", {
      batchId,
      groupId: ids.groupId,
      imageIndex: 0,
      fileName: "receipt.jpg",
      status: "needs_review",
      draftId: ids.draftId,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  await expect(
    t.withIdentity(identity).mutation(api.receiptAnalysisJobs.mutations.retryImageJob, { jobId }),
  ).rejects.toThrow("Draft contains more than 100 items");
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("needs_review");
  expect(job?.draftId).toBe(ids.draftId);
});

it.each([100, 101])(
  "AI解釈へのリセットは現在の明細101件を保持して拒否する（snapshot %i件）",
  async (snapshotCount) => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      const snapshot = Array.from({ length: snapshotCount }, (_, i) => ({
        itemName: `AI明細${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      }));
      const values = {
        status: "needs_review" as const,
        documentType: "receipt" as const,
        shopName: "AI店舗",
        date: "2026-08-26",
        amountYen: 100,
        categoryId: ids.foodId,
        confidence: { amountYen: 1 },
        warnings: [],
        reviewReasons: ["amount_mismatch" as const],
        items: snapshot,
      };
      await ctx.db.patch(ids.draftId, {
        status: "needs_review",
        reviewReasons: ["amount_mismatch"],
        receiptInterpretation: { source: "ai", interpretedAt: 1, values },
        receiptUserOverride: { source: "user", updatedAt: 1, fields: ["items"], values },
      });
      for (let i = 2; i < 101; i++)
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId: ids.groupId,
          draftId: ids.draftId,
          itemName: `現在の明細${i}`,
          amountYen: 1,
          categoryId: ids.foodId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
    });
    const read = () =>
      t.run(async (ctx) => ({
        draft: await ctx.db.get(ids.draftId),
        items: await ctx.db
          .query("aiExpenseDraftItems")
          .withIndex("by_group_id_and_draft_id", (q) =>
            q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
          )
          .collect(),
      }));
    const before = await read();
    await expect(
      t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, {
          draftId: ids.draftId,
        }),
    ).rejects.toThrow("Draft contains more than 100 items");
    expect(await read()).toEqual(before);
  },
);

it("AI解釈へのリセットは現在の明細が100件なら従来どおり復元する", async () => {
  const t = convexTest(schema, convexTestModules);
  const ids = await seed(t);
  await t.run(async (ctx) => {
    const values = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "AI店舗",
      date: "2026-08-26",
      amountYen: 100,
      categoryId: ids.foodId,
      confidence: { amountYen: 1 },
      warnings: [],
      reviewReasons: [],
      items: [{ itemName: "AI明細", amountYen: 100, categoryId: ids.foodId, confidence: {} }],
    };
    await ctx.db.patch(ids.draftId, {
      status: "needs_review",
      receiptInterpretation: { source: "ai", interpretedAt: 1, values },
      receiptUserOverride: { source: "user", updatedAt: 1, fields: ["items"], values },
    });
    for (let i = 2; i < 100; i++)
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: ids.groupId,
        draftId: ids.draftId,
        itemName: `現在の明細${i}`,
        amountYen: 1,
        categoryId: ids.foodId,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
  });
  const result = await t
    .withIdentity(identity)
    .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, {
      draftId: ids.draftId,
    });
  const after = await t.run(async (ctx) => ({
    draft: await ctx.db.get(ids.draftId),
    items: await ctx.db
      .query("aiExpenseDraftItems")
      .withIndex("by_group_id_and_draft_id", (q) =>
        q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
      )
      .collect(),
  }));
  expect(after.items).toHaveLength(1);
  expect(after.items[0].itemName).toBe("AI明細");
  expect(result.items).toHaveLength(1);
  expect(after.draft?.receiptUserOverride).toBeUndefined();
});
