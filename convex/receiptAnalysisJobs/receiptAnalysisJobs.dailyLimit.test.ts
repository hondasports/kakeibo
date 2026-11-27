import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { getTodayDateStringInJapan } from "../../lib/domain/common/date";
import { updateJobStatusHandler } from "./internal";
import { GROUP_ID, createIdentity, createMutationCtx } from "./testHelpers";

const TODAY = getTodayDateStringInJapan(Date.now());

function groupDoc(count: number, jstDate = TODAY) {
  return {
    _id: GROUP_ID,
    name: "group",
    createdAt: 1,
    updatedAt: 1,
    receiptAnalysisDailyUsage: { jstDate, count, updatedAt: 1 },
  };
}

function batchDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "batch-1",
    groupId: GROUP_ID,
    createdByUserId: "https://issuer.example|user-001",
    totalCount: 1,
    processedCount: 0,
    status: "queued",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function jobDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "job-1",
    groupId: GROUP_ID,
    batchId: "batch-1",
    imageIndex: 0,
    fileName: "receipt.png",
    status: "queued",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function startRunning(ctx: Parameters<typeof updateJobStatusHandler>[0], draftId?: string) {
  return updateJobStatusHandler(ctx, {
    jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
    status: "running",
    expectedDraftId: (draftId ?? null) as Id<"aiExpenseDrafts"> | null,
  });
}

describe("日次利用上限（updateJobStatusHandler の running 遷移）", () => {
  it("当日99回済みなら100回目の開始を許可しカウントが100になる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: { "job-1": jobDoc(), "batch-1": batchDoc(), [GROUP_ID]: groupDoc(99) },
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: true });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({
        receiptAnalysisDailyUsage: expect.objectContaining({ count: 100, jstDate: TODAY }),
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "running" }),
    );
  });

  it("当日100回済みなら解析を開始せず失敗下書き付きで failed に確定しバッチを整合させる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: { "job-1": jobDoc(), "batch-1": batchDoc(), [GROUP_ID]: groupDoc(100) },
      // 再計算は batch 内の job を読み直す。上限で failed に確定した job が終端として数えられる状態
      queryResult: [{ _id: "job-1", status: "failed" }],
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });
    // running へは遷移しない
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "running" }),
    );
    // 上限メッセージ付きで failed に確定し、失敗下書きが紐づく
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("[receipt_analysis:daily_limit]"),
        draftId: expect.anything(),
      }),
    );
    // 失敗下書きは既存の失敗表示経路に乗る aiExpenseDrafts として作られる
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        status: "failed",
        createdByUserId: "https://issuer.example|user-001",
        warnings: [expect.stringContaining("[receipt_analysis:daily_limit]")],
      }),
    );
    // 初回の終端なので処理済みカウントを加算する
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ processedCount: 1 }),
    );
    // カウントは消費されない（100のまま）
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({
        receiptAnalysisDailyUsage: expect.objectContaining({ count: 101 }),
      }),
    );
  });

  it("前日に100回使っていても日付が変わればリセットされ開始できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": jobDoc(),
        "batch-1": batchDoc(),
        [GROUP_ID]: groupDoc(100, "2000-01-01"),
      },
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: true });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({
        receiptAnalysisDailyUsage: expect.objectContaining({ count: 1, jstDate: TODAY }),
      }),
    );
  });

  it("開始済みの job の重複開始では枠を消費しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": jobDoc({ status: "running" }),
        "batch-1": batchDoc(),
        [GROUP_ID]: groupDoc(10),
      },
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: false });
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({ receiptAnalysisDailyUsage: expect.anything() }),
    );
  });

  it("利用記録がない既存グループは移行なしで開始できカウント1になる", async () => {
    const groupWithoutUsage = { _id: GROUP_ID, name: "group", createdAt: 1, updatedAt: 1 };
    const ctx = createMutationCtx(createIdentity(), {
      docs: { "job-1": jobDoc(), "batch-1": batchDoc(), [GROUP_ID]: groupWithoutUsage },
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: true });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      GROUP_ID,
      expect.objectContaining({
        receiptAnalysisDailyUsage: expect.objectContaining({ count: 1 }),
      }),
    );
  });

  it("計上済みの再試行ジョブが上限に当たったとき既存下書きを保持し処理済みカウントを2重加算しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        // 初回終端時に計上済みの再試行ジョブ。再計算では件数は終端 job 数から導かれる
        "job-1": jobDoc({ status: "queued", draftId: "draft-existing" }),
        "batch-1": batchDoc({ processedCount: 1 }),
        [GROUP_ID]: groupDoc(100),
      },
      queryResult: [{ _id: "job-1", status: "failed" }],
    });
    const result = await startRunning(ctx, "draft-existing");
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });
    // 新しい失敗下書きは作らず既存の draftId を保持する
    expect(ctx.db.insert).not.toHaveBeenCalledWith("aiExpenseDrafts", expect.anything());
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "failed", draftId: "draft-existing" }),
    );
    // processedCount は終端 job 数の1件のままで2重計上されない
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ processedCount: 1 }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ processedCount: 2 }),
    );
  });

  it("停止回復を経た再試行（未計上）が上限に当たったとき終端を計上してバッチを終わらせる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        // 停止回復は失敗下書きを紐付けるが processedCount を増やさない。
        // draftId はあるが processedCountedAt は無いジョブが再試行で上限に当たった場合。
        "job-1": jobDoc({ status: "queued", draftId: "draft-stale" }),
        "batch-1": batchDoc({ processedCount: 0 }),
        [GROUP_ID]: groupDoc(100),
      },
      queryResult: [{ _id: "job-1", status: "failed" }],
    });
    const result = await startRunning(ctx, "draft-stale");
    expect(result).toEqual({ applied: false, denialReason: "daily_limit" });
    // 未計上だった終端が件数へ反映され、バッチが終端へ進む
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ processedCount: 1 }),
    );
  });

  it("上限はグループごとに独立している", async () => {
    // job-1 は GROUP_ID 所属だが、グループの使用カウントはグループのドキュメントに保持される。
    // 別グループにカウントがあってもこのグループのカウントには影響しないことを、
    // カウント0のグループで開始できることで確認する。
    const ctx = createMutationCtx(createIdentity(), {
      docs: { "job-1": jobDoc(), "batch-1": batchDoc(), [GROUP_ID]: groupDoc(0) },
    });
    const result = await startRunning(ctx);
    expect(result).toEqual({ applied: true });
  });
});
