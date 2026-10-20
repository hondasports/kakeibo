// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildDraftListSummary } from "../lib/domain/aiExpenseDrafts/listSummary";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../lib/convex/aiExpenseDrafts/draftRecordMapping";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

async function seedGroup(t: ReturnType<typeof convexTest>): Promise<Id<"groups">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("groups", {
        name: "backfill 対象グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
  );
}

function draftSeed(groupId: Id<"groups">, fields: Record<string, unknown>) {
  return {
    groupId,
    sourceType: "image_upload",
    documentType: "receipt",
    confidence: {},
    reviewReasons: [],
    ...fields,
  };
}

function itemSeed(
  groupId: Id<"groups">,
  draftId: Id<"aiExpenseDrafts">,
  fields: Record<string, unknown>,
) {
  return {
    groupId,
    draftId,
    itemName: "明細",
    amountYen: 100,
    confidence: {},
    createdAt: 1,
    updatedAt: 1,
    ...fields,
  };
}

describe("aiExpenseDraftListSummaryMigration", () => {
  // executeBatch は ctx.scheduler.runAfter(0, …) で自分自身を再スケジュールする。
  // 実タイマーのままだと edge-runtime の teardown 後に走り、EnvironmentTeardownError で vitest が失敗する。
  // （convex/orphanedLineLinkMigration.test.ts と同じ対処）
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("listSummary 未設定の ready / needs_review 下書きを補完し、対象外と updatedAt に触れず、冪等に再実行できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const ids = await t.run(async (ctx) => {
      const catFood = await ctx.db.insert("categories", {
        groupId,
        name: "食費",
        color: "#f97316",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const catDaily = await ctx.db.insert("categories", {
        groupId,
        name: "日用品",
        color: "#0ea5e9",
        isActive: true,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const needsReview = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "needs_review",
          shopName: "対象店",
          date: "2026-10-01",
          amountYen: 1500,
          createdAt: 1,
          updatedAt: 101,
        }),
      );
      const ready = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "ready",
          amountYen: 800,
          createdAt: 2,
          updatedAt: 102,
        }),
      );
      const alreadySaved = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "ready",
          amountYen: 300,
          listSummary: { amountAndTaxResolved: false },
          createdAt: 3,
          updatedAt: 103,
        }),
      );
      const registered = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          createdAt: 4,
          updatedAt: 104,
        }),
      );
      const failed = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "failed",
          createdAt: 5,
          updatedAt: 105,
        }),
      );
      // 作成順の昇順で読むこと。categoryAggregates は初出のカテゴリ順で並ぶ。
      await ctx.db.insert(
        "aiExpenseDraftItems",
        itemSeed(groupId, needsReview, {
          itemName: "食パン",
          amountYen: 1000,
          categoryId: catFood,
        }),
      );
      await ctx.db.insert(
        "aiExpenseDraftItems",
        itemSeed(groupId, needsReview, {
          itemName: "洗剤",
          amountYen: 500,
          categoryId: catDaily,
        }),
      );
      await ctx.db.insert(
        "aiExpenseDraftItems",
        itemSeed(groupId, ready, { itemName: "牛乳", amountYen: 800, categoryId: catFood }),
      );
      // 対象外の status にも明細を置き、読み取り・書き込みともに触らないことを確認する。
      await ctx.db.insert(
        "aiExpenseDraftItems",
        itemSeed(groupId, registered, { itemName: "対象外", amountYen: 100 }),
      );
      return { needsReview, ready, alreadySaved, registered, failed };
    });

    const dryRun = await t.query(internal.aiExpenseDraftListSummaryMigration.dryRun, {});
    expect(dryRun).toMatchObject({ isDone: true, needsBackfill: 2, alreadyBackfilled: 1 });

    const result = await t.mutation(internal.aiExpenseDraftListSummaryMigration.executeBatch, {});
    expect(result).toMatchObject({ isDone: true, backfilled: 2, alreadyBackfilled: 1 });

    const docs = await t.run(async (ctx) => ({
      needsReview: await ctx.db.get(ids.needsReview),
      ready: await ctx.db.get(ids.ready),
      alreadySaved: await ctx.db.get(ids.alreadySaved),
      registered: await ctx.db.get(ids.registered),
      failed: await ctx.db.get(ids.failed),
      needsReviewItems: await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId).eq("draftId", ids.needsReview),
        )
        .order("asc")
        .collect(),
      readyItems: await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId).eq("draftId", ids.ready),
        )
        .order("asc")
        .collect(),
    }));

    // 保存値は buildDraftListSummary に下書きと明細（作成順の昇順）を渡した結果と一致する。
    expect(docs.needsReview?.listSummary).toEqual(
      buildDraftListSummary(
        draftDocToFields(docs.needsReview!),
        docs.needsReviewItems.map(draftItemDocToFields),
      ),
    );
    expect(docs.ready?.listSummary).toEqual(
      buildDraftListSummary(
        draftDocToFields(docs.ready!),
        docs.readyItems.map(draftItemDocToFields),
      ),
    );
    // 対象外には触れない。
    expect(docs.alreadySaved?.listSummary).toEqual({ amountAndTaxResolved: false });
    expect(docs.registered?.listSummary).toBeUndefined();
    expect(docs.failed?.listSummary).toBeUndefined();
    // backfill は listSummary だけを埋め、updatedAt を動かさない。
    expect(docs.needsReview?.updatedAt).toBe(101);
    expect(docs.ready?.updatedAt).toBe(102);

    expect(await t.query(internal.aiExpenseDraftListSummaryMigration.verify, {})).toMatchObject({
      isDone: true,
      remaining: 0,
    });

    const again = await t.mutation(internal.aiExpenseDraftListSummaryMigration.executeBatch, {});
    expect(again.backfilled).toBe(0);
  });

  it("明細が0件の対象下書きも補完される（itemSummary は省略される）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const draftId = await t.run(
      async (ctx) =>
        await ctx.db.insert(
          "aiExpenseDrafts",
          draftSeed(groupId, { status: "needs_review", createdAt: 1, updatedAt: 11 }),
        ),
    );

    await t.mutation(internal.aiExpenseDraftListSummaryMigration.executeBatch, {});

    const draft = await t.run(async (ctx) => await ctx.db.get(draftId));
    expect(draft?.listSummary).toEqual(buildDraftListSummary(draftDocToFields(draft!), []));
    expect(draft?.listSummary).not.toHaveProperty("itemSummary");
  });

  it("バッチ上限ごとに cursor を返して継続する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 26; i += 1) {
        await ctx.db.insert(
          "aiExpenseDrafts",
          draftSeed(groupId, { status: "ready", createdAt: i, updatedAt: 1000 + i }),
        );
      }
    });

    const first = await t.mutation(internal.aiExpenseDraftListSummaryMigration.executeBatch, {});
    expect(first.isDone).toBe(false);
    expect(first.backfilled).toBe(25);
    expect(first.continueCursor).not.toBeNull();

    const second = await t.mutation(internal.aiExpenseDraftListSummaryMigration.executeBatch, {
      cursor: first.continueCursor ?? undefined,
    });
    expect(second.isDone).toBe(true);
    expect(second.backfilled).toBe(1);

    const verify = await t.query(internal.aiExpenseDraftListSummaryMigration.verify, {});
    expect(verify.remaining).toBe(0);
  });
});
