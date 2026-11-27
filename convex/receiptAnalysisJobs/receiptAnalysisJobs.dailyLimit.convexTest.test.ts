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
import { RECEIPT_ANALYSIS_STALE_JOB_MS } from "../../lib/domain/receiptAnalysisJobs/rules";

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

  it("上限後に開始できた再解析が別理由で失敗すると古い上限タグだけ消え下書き内容は維持される", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    // 初回が上限で拒否された下書き（上限タグと他の警告を持つ）
    const taggedDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "failed",
        documentType: "unknown",
        imageFileName: "receipt-0.jpg",
        confidence: {},
        warnings: [RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG, "別の警告メモ"],
        reviewReasons: ["parse_failed"],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const { jobIds } = await seedBatchWithJobs(t, groupId, [
      { status: "queued", draftId: taggedDraftId as Id<"aiExpenseDrafts"> },
    ]);
    const jobId = jobIds[0];

    // 翌日になって再解析を開始できる（消費は成功）
    await t.run(async (ctx) => {
      await ctx.db.patch(groupId, {
        receiptAnalysisDailyUsage: { jstDate: "2000-01-01", count: 100, updatedAt: 1 },
      });
    });
    expect(await startRunning(t, jobId, taggedDraftId as Id<"aiExpenseDrafts">)).toEqual({
      applied: true,
    });

    // 再解析は別理由で失敗し、既存下書きを保持して終端する
    const newFailureDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "failed",
        documentType: "unknown",
        confidence: {},
        warnings: ["[receipt_extraction:network]"],
        reviewReasons: ["parse_failed"],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const finalize = await t
      .withIdentity(identity)
      .mutation(internal.receiptAnalysisJobs.internal.finalizeAnalysisAttempt, {
        jobId,
        groupId,
        expectedDraftId: taggedDraftId as Id<"aiExpenseDrafts">,
        newDraftId: newFailureDraftId as Id<"aiExpenseDrafts">,
        status: "failed",
        error: "[receipt_extraction:network]",
      });
    expect(finalize).toEqual({ applied: true });

    await t.run(async (ctx) => {
      const draft = await ctx.db.get(taggedDraftId);
      // 古い上限タグだけ消え、他の警告と内容は維持される
      expect(draft?.warnings).toEqual(["別の警告メモ"]);
      expect(draft?.imageFileName).toBe("receipt-0.jpg");
      // 再試行の再解析で新たに作られた失敗下書きは破棄される（既存経路どおり）
      expect(await ctx.db.get(newFailureDraftId)).toBeNull();
    });

    // 再び上限で拒否されたときは、保持された下書きへタグが戻り案内が維持される
    await t.withIdentity(identity).mutation(api.receiptAnalysisJobs.mutations.retryImageJob, {
      jobId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(groupId, {
        receiptAnalysisDailyUsage: {
          jstDate: getTodayDateStringInJapan(Date.now()),
          count: 100,
          updatedAt: 1,
        },
      });
    });
    const denied = await startRunning(t, jobId, taggedDraftId as Id<"aiExpenseDrafts">);
    expect(denied).toEqual({ applied: false, denialReason: "daily_limit" });
    await t.run(async (ctx) => {
      const draft = await ctx.db.get(taggedDraftId);
      expect(draft?.warnings).toContain(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);
      expect(draft?.warnings).toContain("別の警告メモ");
    });
  });

  it("上限拒否とキャンセルで全ジョブが終端するとバッチも終端する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    const { batchId, jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "queued" }, { status: "queued" }],
      { totalCount: 2 },
    );

    // 1件目は上限で拒否され failed に終端する
    expect(await startRunning(t, jobIds[0])).toEqual({
      applied: false,
      denialReason: "daily_limit",
    });

    // 2件目をキャンセルすると、キャンセル経路でもバッチが再計算され終端する
    await t.withIdentity(identity).mutation(api.receiptAnalysisJobs.mutations.cancelImageJob, {
      jobId: jobIds[1],
    });

    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      expect(batch?.processedCount).toBe(2);
      expect(batch?.status).toBe("partially_failed");
    });
  });

  it("確認待ちの税情報付き下書きの再解析が上限で拒否されても警告は変わらず合計だけ保存で ready になる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    // 税情報を持つ確認待ちの既存下書き（警告なし）
    const reviewDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "receipt",
        imageFileName: "receipt-0.jpg",
        shopName: "テスト商店",
        date: "2025-01-10",
        amountYen: 1080,
        confidence: {},
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: [
          {
            taxRatePercent: 10,
            taxMode: "included",
            taxableAmountYen: 1080,
            taxableAmountBasis: "tax_included",
            taxYen: 98,
            roundingMethod: "floor",
            confidence: {},
            warnings: [],
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    // 「レシート合計だけ保存」の保存先として、同グループのカテゴリを seed する
    const categoryId = await t.run(async (ctx) => {
      return await ctx.db.insert("categories", {
        groupId,
        name: "食費",
        color: "#f97316",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const { jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "queued", draftId: reviewDraftId as Id<"aiExpenseDrafts"> }],
      { totalCount: 1 },
    );

    // 上限で拒否される。確認待ちの下書きの警告・税判断は書き換えられない
    expect(await startRunning(t, jobIds[0], reviewDraftId as Id<"aiExpenseDrafts">)).toEqual({
      applied: false,
      denialReason: "daily_limit",
    });
    const draft = await t.run(async (ctx) => await ctx.db.get(reviewDraftId));
    expect(draft?.status).toBe("needs_review");
    expect(draft?.warnings).toEqual([]);
    expect(draft?.warnings ?? []).not.toContain(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);

    // 警告が変わらないので「レシート合計だけ保存」の既存フローで ready になる。
    // タグが警告へ混入すると warnings.length > 0 で low_confidence が付き登録待ちへ進めない。
    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
      draftId: reviewDraftId as Id<"aiExpenseDrafts">,
      documentType: "receipt",
      shopName: "テスト商店",
      date: "2025-01-10",
      amountYen: 1080,
      registrationMode: "totalOnly",
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      categoryId,
    });
    const saved = await t.run(async (ctx) => await ctx.db.get(reviewDraftId));
    expect(saved?.status).toBe("ready");
  });

  it("翌日に開始できた再解析が停止回復で終端しても古い上限警告は復活せずバッチは終端する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t, { usageCount: 100 });
    // 初回が上限で拒否された下書き（上限タグと他の警告を持つ）
    const taggedDraftId = await t.run(async (ctx) => {
      return await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId: TEST_USER_ID,
        sourceType: "image_upload",
        status: "failed",
        documentType: "unknown",
        imageFileName: "receipt-0.jpg",
        confidence: {},
        warnings: [RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG, "別の警告メモ"],
        reviewReasons: ["parse_failed"],
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const { batchId, jobIds } = await seedBatchWithJobs(
      t,
      groupId,
      [{ status: "queued", draftId: taggedDraftId as Id<"aiExpenseDrafts"> }, { status: "queued" }],
      { totalCount: 2 },
    );

    // 上限で1件目が拒否され failed に終端（下書きは保持）
    expect(await startRunning(t, jobIds[0], taggedDraftId as Id<"aiExpenseDrafts">)).toEqual({
      applied: false,
      denialReason: "daily_limit",
    });

    // 翌日に再解析を開始できる。開始確定の時点でタグは外れる
    await t.run(async (ctx) => {
      await ctx.db.patch(groupId, {
        receiptAnalysisDailyUsage: { jstDate: "2000-01-01", count: 100, updatedAt: 1 },
      });
    });
    await t.withIdentity(identity).mutation(api.receiptAnalysisJobs.mutations.retryImageJob, {
      jobId: jobIds[0],
    });
    expect(await startRunning(t, jobIds[0], taggedDraftId as Id<"aiExpenseDrafts">)).toEqual({
      applied: true,
    });
    await t.run(async (ctx) => {
      const draft = await ctx.db.get(taggedDraftId);
      expect(draft?.warnings).toEqual(["別の警告メモ"]);
    });

    // 処理が止まった状態（時刻seedで古い updatedAt にする）にして停止回復を実行する
    const staleUpdatedAt = Date.now() - RECEIPT_ANALYSIS_STALE_JOB_MS - 1000;
    await t.run(async (ctx) => {
      await ctx.db.patch(jobIds[0], { updatedAt: staleUpdatedAt });
      await ctx.db.patch(jobIds[1], { updatedAt: staleUpdatedAt });
    });
    const recovered = await t.mutation(
      internal.receiptAnalysisJobs.internal.recoverStaleReceiptAnalysisJobs,
      {},
    );
    expect(recovered.recoveredCount).toBeGreaterThanOrEqual(1);

    await t.run(async (ctx) => {
      // 停止回復で failed になっても古い上限警告は復活しない
      const draft = await ctx.db.get(taggedDraftId);
      expect(draft?.warnings).not.toContain(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);
      expect(draft?.warnings).toContain("別の警告メモ");
      // 全ジョブ終端なのでバッチも終端する（回復経路で再計算される）
      const batch = await ctx.db.get(batchId);
      expect(batch?.processedCount).toBe(2);
      expect(batch?.status).toBe("partially_failed");
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
