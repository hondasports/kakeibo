// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it, vi, afterEach } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { getTodayDateStringInJapan } from "../../lib/domain/common/date";
import { RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG } from "../../lib/domain/receiptAnalysisJobs/dailyUsage";

const TEST_USER_ID = "daily-limit-user";
const OTHER_USER_ID = "daily-limit-other-user";
const identity = {
  tokenIdentifier: TEST_USER_ID,
  subject: `clerk-${TEST_USER_ID}`,
  issuer: "https://issuer.example",
};

async function seedGroup(
  t: ReturnType<typeof convexTest>,
  {
    usageCount,
    jstDate,
    userId = TEST_USER_ID,
  }: { usageCount?: number; jstDate?: string; userId?: string } = {},
): Promise<Id<"groups">> {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "日次上限確認グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      ...(usageCount === undefined
        ? {}
        : {
            receiptAnalysisDailyUsage: {
              jstDate: jstDate ?? getTodayDateStringInJapan(Date.now()),
              count: usageCount,
              updatedAt: 1,
            },
          }),
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    return groupId;
  });
}

async function seedBatchWithJobs(
  t: ReturnType<typeof convexTest>,
  groupId: Id<"groups">,
  jobs: Array<{
    status: "queued" | "running" | "failed" | "ready";
    draftId?: Id<"aiExpenseDrafts">;
  }>,
  batchOverrides: Record<string, unknown> = {},
): Promise<{ batchId: Id<"receiptAnalysisBatches">; jobIds: Id<"receiptAnalysisImageJobs">[] }> {
  return await t.run(async (ctx) => {
    const batchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId,
      createdByUserId: TEST_USER_ID,
      totalCount: jobs.length,
      processedCount: 0,
      status: "running",
      createdAt: 1,
      updatedAt: 1,
      ...batchOverrides,
    });
    const jobIds: Id<"receiptAnalysisImageJobs">[] = [];
    for (const [index, job] of jobs.entries()) {
      jobIds.push(
        await ctx.db.insert("receiptAnalysisImageJobs", {
          batchId,
          groupId,
          imageIndex: index,
          fileName: `receipt-${index}.jpg`,
          status: job.status,
          ...(job.draftId === undefined ? {} : { draftId: job.draftId }),
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { batchId, jobIds };
  });
}

function startRunning(
  t: ReturnType<typeof convexTest>,
  jobId: Id<"receiptAnalysisImageJobs">,
  expectedDraftId: Id<"aiExpenseDrafts"> | null = null,
) {
  return t.withIdentity(identity).mutation(internal.receiptAnalysisJobs.internal.updateJobStatus, {
    jobId,
    status: "running",
    expectedDraftId,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("日次利用上限の結合確認（永続状態）", () => {
  it("99回済みで2ジョブを並行開始すると100回で止まり、超過分は失敗下書き付きで終端する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 99 });
    const { batchId, jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "queued" }, { status: "queued" }],
      { totalCount: 2 },
    );

    const results = await Promise.all([startRunning(t, jobIds[0]), startRunning(t, jobIds[1])]);
    const applied = results.filter((r) => r?.applied === true);
    const denied = results.filter((r) => r?.applied === false);
    expect(applied).toHaveLength(1);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toEqual({ applied: false, denialReason: "daily_limit" });

    await t.run(async (ctx) => {
      // カウントはちょうど100で止まる
      const group = await ctx.db.get(groupId);
      expect(group?.receiptAnalysisDailyUsage?.count).toBe(100);
      // 拒否された job は失敗下書き付きで failed に終端する
      const deniedJobId = results[0]?.applied === false ? jobIds[0] : jobIds[1];
      const deniedJob = await ctx.db.get(deniedJobId);
      expect(deniedJob?.status).toBe("failed");
      expect(deniedJob?.error).toContain(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);
      expect(deniedJob?.draftId).toBeDefined();
      // 失敗下書きは認証済みの actor を作成者に持ち、構造化タグを warnings に持つ
      const draft = await ctx.db.get(deniedJob!.draftId!);
      expect(draft?.status).toBe("failed");
      expect(draft?.createdByUserId).toBe(TEST_USER_ID);
      expect(draft?.warnings?.[0]).toContain(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);
      // 2件バッチのうち1件実行中・1件終端なので processedCount は1、バッチは終端しない
      const batch = await ctx.db.get(batchId);
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).toBe("running");
    });
  });

  it("単独バッチが上限で終端するとバッチも終端する（抽出は mutation 後の action が走らない）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    const { batchId, jobIds } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);

    const result = await startRunning(t, jobIds[0]);
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });

    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).toBe("partially_failed");
      // カウントは消費されない
      const group = await ctx.db.get(groupId);
      expect(group?.receiptAnalysisDailyUsage?.count).toBe(100);
    });
  });

  it("開始済みの同一ジョブの重複開始では枠を消費しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const { jobIds } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);

    const first = await startRunning(t, jobIds[0]);
    expect(first).toEqual({ applied: true });
    const second = await startRunning(t, jobIds[0]);
    expect(second).toEqual({ applied: false });
    expect((second as { denialReason?: string })?.denialReason).toBeUndefined();

    await t.run(async (ctx) => {
      const group = await ctx.db.get(groupId);
      expect(group?.receiptAnalysisDailyUsage?.count).toBe(1);
    });
  });

  it("固定時計で日本時間の日替わりを跨ぐとカウントがリセットされる", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-11-25 23:30 JST (= 14:30 UTC) に100回到達済みとする
    vi.setSystemTime(Date.UTC(2026, 10, 25, 14, 30, 0));
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100, jstDate: "2026-11-25" });
    const { jobIds } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);

    const beforeMidnight = await startRunning(t, jobIds[0]);
    expect(beforeMidnight).toEqual({ applied: false, denialReason: "daily_limit" });

    // 日本時間の翌0時（UTC 15:00）を過ぎると再開できる
    vi.setSystemTime(Date.UTC(2026, 10, 25, 15, 0, 1));
    const retry = await t
      .withIdentity(identity)
      .mutation(internal.receiptAnalysisJobs.internal.updateJobStatus, {
        jobId: jobIds[0],
        status: "running",
        expectedDraftId: null,
      });
    // job は failed に終端しているため開始は適用されないが、カウントはリセットされて消費もされない
    expect(retry).toEqual({ applied: false });

    const { jobIds: nextDayJobs } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);
    const nextDay = await startRunning(t, nextDayJobs[0]);
    expect(nextDay).toEqual({ applied: true });
    await t.run(async (ctx) => {
      const group = await ctx.db.get(groupId);
      expect(group?.receiptAnalysisDailyUsage?.jstDate).toBe("2026-11-26");
      expect(group?.receiptAnalysisDailyUsage?.count).toBe(1);
    });
  });

  it("上限はグループごとに独立している", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupA = await seedGroup(t, { usageCount: 100 });
    const groupB = await seedGroup(t, { usageCount: 0 });
    const { jobIds: jobsA } = await seedBatchWithJobs(t, groupA, [{ status: "queued" }]);
    const { jobIds: jobsB } = await seedBatchWithJobs(t, groupB, [{ status: "queued" }]);

    expect(await startRunning(t, jobsA[0])).toEqual({
      applied: false,
      denialReason: "daily_limit",
    });
    expect(await startRunning(t, jobsB[0])).toEqual({ applied: true });
  });

  it("既存の下書きありの再試行が上限に当たっても下書きを置き換えず処理済み1件のまま", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    // 既存の処理済みバッチ: 初回解析が完了し processedCount=1、下書きを持つ
    const existingDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "receipt",
        confidence: {},
        warnings: [],
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const { batchId, jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      // 再試行で queued に戻った job（draftId あり）
      [{ status: "queued", draftId: existingDraftId as Id<"aiExpenseDrafts"> }],
      { processedCount: 1, status: "completed" },
    );

    const result = await startRunning(t, jobIds[0], existingDraftId as Id<"aiExpenseDrafts">);
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });

    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobIds[0]);
      // 既存の下書きを保持し、新しい下書きは作らない
      expect(job?.draftId).toBe(existingDraftId);
      const draft = await ctx.db.get(existingDraftId);
      expect(draft?.status).toBe("needs_review");
      const batch = await ctx.db.get(batchId);
      // 処理済み1件のまま増えず、終端済みのバッチは待ち状態へ戻らない
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).not.toBe("queued");
    });
  });

  it("停止回復を経た再試行が上限で拒否されてもバッチは終端へ進み待ち状態に残らない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    // 停止回復は失敗下書きを紐付けるが processedCount を増やさない
    const staleDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "failed",
        documentType: "unknown",
        confidence: {},
        warnings: ["解析が完了しませんでした。もう一度お試しください"],
        reviewReasons: ["parse_failed"],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const { batchId, jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "queued", draftId: staleDraftId as Id<"aiExpenseDrafts"> }],
      { processedCount: 0 },
    );

    const result = await startRunning(t, jobIds[0], staleDraftId as Id<"aiExpenseDrafts">);
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });

    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      // 終端が件数へ反映されバッチが終端する（待ち状態に残らない）
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).toBe("partially_failed");
    });
  });

  it("初回開始→失敗→公開 retry で再開始すると消費は1回→1回のまま→2回と保存される", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const { jobIds } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);

    // 初回開始で1回消費する
    expect(await startRunning(t, jobIds[0])).toEqual({ applied: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(groupId))?.receiptAnalysisDailyUsage?.count).toBe(1);
    });

    // 解析失敗で job が failed に終端しても消費は1回のまま（失敗分も有料解析として計上済み）
    await t.withIdentity(identity).mutation(internal.receiptAnalysisJobs.internal.updateJobStatus, {
      jobId: jobIds[0],
      status: "failed",
      error: "analysis failed",
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(groupId))?.receiptAnalysisDailyUsage?.count).toBe(1);
    });

    // 公開 retry mutation で queued に戻す
    await t.withIdentity(identity).mutation(api.receiptAnalysisJobs.mutations.retryImageJob, {
      jobId: jobIds[0],
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(jobIds[0]))?.status).toBe("queued");
      // 再試行の準備では消費しない
      expect((await ctx.db.get(groupId))?.receiptAnalysisDailyUsage?.count).toBe(1);
    });

    // 再開すると2回目として消費する
    expect(await startRunning(t, jobIds[0])).toEqual({ applied: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(groupId))?.receiptAnalysisDailyUsage?.count).toBe(2);
    });
  });

  it("旧2 mutation 名を順に実行しても終端バッチの件数を重複加算しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    // デプロイ開始前に起動した旧 action を模す: job は終端済みで、旧2 mutation を順に呼ぶ
    const { batchId } = await seedBatchWithJobs(t, groupId, [{ status: "failed" }], {
      processedCount: 0,
    });

    await t.mutation(internal.receiptAnalysisJobs.internal.incrementBatchProcessedCount, {
      batchId,
    });
    await t.mutation(internal.receiptAnalysisJobs.internal.finalizeBatchStatus, { batchId });

    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      // 終端 job は1件なので processedCount は1のまま。2つ順に呼んでも重複しない
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).toBe("partially_failed");
    });
  });

  it("旧 finalizeBatchStatus 単体でも job の実状態から進捗を再計算できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const { batchId } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "ready" }, { status: "running" }],
      { processedCount: 0 },
    );

    await t.mutation(internal.receiptAnalysisJobs.internal.finalizeBatchStatus, { batchId });

    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      // 終端1件・実行中1件なので完了せず running のまま件数だけ反映される
      expect(batch?.processedCount).toBe(1);
      expect(batch?.status).toBe("running");
    });
  });

  it("所属していないグループの job は開始を確定せず下書きも残さない", async () => {
    const t = convexTest(schema, convexTestModules);
    // identity のユーザーが所属しないグループ（別ユーザーだけがメンバー）
    const groupId = await seedGroup(t, { usageCount: 100, userId: OTHER_USER_ID });
    const { jobIds } = await seedBatchWithJobs(t, groupId, [{ status: "queued" }]);

    await expect(startRunning(t, jobIds[0])).rejects.toThrow("グループに所属していません");
    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobIds[0]);
      // 開始は確定せず queued のまま、失敗下書きも紐付かない
      expect(job?.status).toBe("queued");
      expect(job?.draftId).toBeUndefined();
    });
  });
});
