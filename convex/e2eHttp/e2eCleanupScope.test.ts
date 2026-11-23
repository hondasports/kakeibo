// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

describe("E2E cleanup ownership scope", () => {
  it("同一グループの別ユーザー・別グループ・旧データを削除しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "E2E cleanup scope group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherGroupId = await ctx.db.insert("groups", {
        name: "E2E cleanup scope other group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await ctx.db.insert("categories", {
        groupId,
        name: "E2E cleanup scope category",
        color: "#000000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });

      const createReceipt = (targetGroupId: typeof groupId, createdByUserId?: string) =>
        ctx.db.insert("receipts", {
          groupId: targetGroupId,
          createdByUserId,
          date: "2026-08-01",
          type: "expense",
          shopName: "E2E cleanup receipt",
          amountYen: 100,
          categoryId,
          weekStartDate: "2026-07-27",
          createdAt: 1,
          updatedAt: 1,
        });
      const receiptA = await createReceipt(groupId, "user-a");
      const receiptB = await createReceipt(groupId, "user-b");
      const legacyReceipt = await createReceipt(groupId);
      const otherGroupReceipt = await createReceipt(otherGroupId, "user-a");

      const createExpenseEntry = (targetGroupId: typeof groupId, createdByUserId?: string) =>
        ctx.db.insert("expenseEntries", {
          groupId: targetGroupId,
          createdByUserId,
          date: "2026-08-01",
          amount: 100,
          categoryId,
          title: "E2E cleanup entry",
          entryType: "expense",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
        });
      const expenseEntryA = await createExpenseEntry(groupId, "user-a");
      const expenseEntryB = await createExpenseEntry(groupId, "user-b");
      const legacyExpenseEntry = await createExpenseEntry(groupId);
      const otherGroupExpenseEntry = await createExpenseEntry(otherGroupId, "user-a");

      const createDraft = (targetGroupId: typeof groupId, createdByUserId?: string) =>
        ctx.db.insert("aiExpenseDrafts", {
          groupId: targetGroupId,
          createdByUserId,
          sourceType: "image_upload",
          status: "ready",
          documentType: "receipt",
          confidence: {},
          reviewReasons: [],
          createdAt: 1,
          updatedAt: 1,
        });
      const draftA = await createDraft(groupId, "user-a");
      const draftB = await createDraft(groupId, "user-b");
      const legacyDraft = await createDraft(groupId);
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId,
        draftId: draftA,
        itemName: "E2E cleanup item A",
        amountYen: 100,
        categoryId,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId,
        draftId: draftB,
        itemName: "E2E cleanup item B",
        amountYen: 100,
        categoryId,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });

      const createBatch = (targetGroupId: typeof groupId, createdByUserId?: string) =>
        ctx.db.insert("receiptAnalysisBatches", {
          groupId: targetGroupId,
          createdByUserId,
          totalCount: 1,
          processedCount: 0,
          status: "queued",
          createdAt: 1,
          updatedAt: 1,
        });
      const batchA = await createBatch(groupId, "user-a");
      const batchB = await createBatch(groupId, "user-b");
      const otherGroupBatch = await createBatch(otherGroupId, "user-a");
      const jobA = await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId: batchA,
        groupId,
        imageIndex: 0,
        fileName: "e2e-a.png",
        status: "queued",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobB = await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId: batchB,
        groupId,
        imageIndex: 0,
        fileName: "e2e-b.png",
        status: "queued",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherGroupJob = await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId: otherGroupBatch,
        groupId: otherGroupId,
        imageIndex: 0,
        fileName: "e2e-other.png",
        status: "queued",
        createdAt: 1,
        updatedAt: 1,
      });

      return {
        groupId,
        otherGroupId,
        receiptA,
        receiptB,
        legacyReceipt,
        otherGroupReceipt,
        expenseEntryA,
        expenseEntryB,
        legacyExpenseEntry,
        otherGroupExpenseEntry,
        draftA,
        draftB,
        legacyDraft,
        batchA,
        batchB,
        otherGroupBatch,
        jobA,
        jobB,
        otherGroupJob,
      };
    });

    await expect(
      t.mutation(internal.receipts.crud.deleteReceiptsByUser, {
        groupId: ids.groupId,
        userId: "user-a",
      }),
    ).resolves.toMatchObject({ deletedCount: 1 });
    await expect(
      t.mutation(internal.expenseEntries.internal.deleteE2eExpenseEntriesByUser, {
        groupId: ids.groupId,
        userId: "user-a",
      }),
    ).resolves.toMatchObject({ deletedCount: 1 });
    await expect(
      t.mutation(internal.aiExpenseDrafts.internal.deleteDraftsByUserBatch, {
        groupId: ids.groupId,
        userId: "user-a",
      }),
    ).resolves.toMatchObject({ deletedDraftCount: 1, deletedItemCount: 1, hasMore: false });
    await expect(
      t.mutation(internal.receiptAnalysisJobs.internal.deleteReceiptAnalysisDataByUserBatch, {
        groupId: ids.groupId,
        userId: "user-a",
      }),
    ).resolves.toMatchObject({ deletedBatchCount: 1, deletedJobCount: 1, hasMore: false });

    const remaining = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("receipts").take(20),
      expenseEntries: await ctx.db.query("expenseEntries").take(20),
      drafts: await ctx.db.query("aiExpenseDrafts").take(20),
      draftItems: await ctx.db.query("aiExpenseDraftItems").take(20),
      batches: await ctx.db.query("receiptAnalysisBatches").take(20),
      jobs: await ctx.db.query("receiptAnalysisImageJobs").take(20),
    }));

    expect(remaining.receipts.map((row) => row._id)).toEqual(
      expect.arrayContaining([ids.receiptB, ids.legacyReceipt, ids.otherGroupReceipt]),
    );
    expect(remaining.receipts.map((row) => row._id)).not.toContain(ids.receiptA);
    expect(remaining.expenseEntries.map((row) => row._id)).toEqual(
      expect.arrayContaining([
        ids.expenseEntryB,
        ids.legacyExpenseEntry,
        ids.otherGroupExpenseEntry,
      ]),
    );
    expect(remaining.expenseEntries.map((row) => row._id)).not.toContain(ids.expenseEntryA);
    expect(remaining.drafts.map((row) => row._id)).toEqual(
      expect.arrayContaining([ids.draftB, ids.legacyDraft]),
    );
    expect(remaining.drafts.map((row) => row._id)).not.toContain(ids.draftA);
    expect(remaining.draftItems.map((row) => row.draftId)).toEqual([ids.draftB]);
    expect(remaining.batches.map((row) => row._id)).toEqual(
      expect.arrayContaining([ids.batchB, ids.otherGroupBatch]),
    );
    expect(remaining.batches.map((row) => row._id)).not.toContain(ids.batchA);
    expect(remaining.jobs.map((row) => row._id)).toEqual(
      expect.arrayContaining([ids.jobB, ids.otherGroupJob]),
    );
    expect(remaining.jobs.map((row) => row._id)).not.toContain(ids.jobA);
  });

  it("clearE2eDataForUser は対象ユーザーの保存・最近の検索だけを消し、他ユーザーの分は残す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await t.run((ctx) =>
      ctx.db.insert("groups", { name: "g", status: "active", createdAt: 1, updatedAt: 1 }),
    );
    await t.run(async (ctx) => {
      for (const [userId, kind] of [
        ["e2e-user", "saved"],
        ["e2e-user", "recent"],
        ["other-user", "saved"],
        ["other-user", "recent"],
      ] as const) {
        await ctx.db.insert("savedExpenseSearches", {
          userId,
          groupId,
          kind,
          query: "q=a",
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });

    const result = await t.mutation(internal.savedExpenseSearches.internal.clearE2eDataForUser, {
      userId: "e2e-user",
    });

    expect(result).toEqual({ deletedCount: 2, hasMore: false });
    const remaining = await t.run((ctx) => ctx.db.query("savedExpenseSearches").collect());
    expect(remaining.map((row) => `${row.userId}:${row.kind}`).sort()).toEqual([
      "other-user:recent",
      "other-user:saved",
    ]);
  });
});
