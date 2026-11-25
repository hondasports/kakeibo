import { describe, expect, it, vi } from "vitest";
import type { ReceiptAnalysisActionRunner } from "../../domain/receiptAnalysisJobs/actionRunner";
import { RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR } from "../../domain/receiptAnalysisJobs/dailyUsage";
import { analyzeReceiptImageJob } from "./actions";

function createRunner(
  overrides: Partial<ReceiptAnalysisActionRunner>,
): ReceiptAnalysisActionRunner {
  return {
    assertConsent: vi.fn().mockResolvedValue(undefined),
    getMyGroup: vi.fn().mockResolvedValue({ id: "group-1" }),
    getJob: vi.fn().mockResolvedValue({
      id: "job-1",
      groupId: "group-1",
      batchId: "batch-1",
      status: "queued",
      fileName: "receipt.png",
    }),
    startAttempt: vi.fn().mockResolvedValue({ applied: true }),
    waitForMockExtractor: vi.fn().mockResolvedValue(undefined),
    loadPreservedUserOverride: vi.fn().mockResolvedValue(null),
    analyzeImage: vi.fn().mockResolvedValue({ id: "draft-1", status: "ready", updatedAt: 1 }),
    createFailureDraft: vi.fn(),
    finalizeAttempt: vi.fn().mockResolvedValue({ applied: true }),
    recomputeBatchProgress: vi.fn().mockResolvedValue(undefined),
    getBatch: vi.fn().mockResolvedValue(null),
    enqueueAiReviewRequiredNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ReceiptAnalysisActionRunner;
}

describe("analyzeReceiptImageJob の日次上限", () => {
  it("開始が上限で拒否されたら抽出を実行せず翌日の案内を持つエラーを投げる", async () => {
    const runner = createRunner({
      startAttempt: vi.fn().mockResolvedValue({ applied: false, denialReason: "daily_limit" }),
    });
    await expect(
      analyzeReceiptImageJob(runner, { jobId: "job-1", imageDataUrl: "data:image/jpeg;base64,AA" }),
    ).rejects.toThrow(RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR);
    // 有料解析・失敗下書きの作成・進捗の再計算には進まない（mutation 側で終端済み）
    expect(runner.analyzeImage).not.toHaveBeenCalled();
    expect(runner.createFailureDraft).not.toHaveBeenCalled();
    expect(runner.recomputeBatchProgress).not.toHaveBeenCalled();
  });

  it("上限以外の重複開始では静かに終了しエラーを投げない", async () => {
    const runner = createRunner({
      startAttempt: vi.fn().mockResolvedValue({ applied: false }),
    });
    await expect(
      analyzeReceiptImageJob(runner, { jobId: "job-1", imageDataUrl: "data:image/jpeg;base64,AA" }),
    ).resolves.toBeUndefined();
    expect(runner.analyzeImage).not.toHaveBeenCalled();
  });

  it("解析が終端に進んだら batch の進捗再計算を1回だけ呼ぶ", async () => {
    const runner = createRunner({});
    await analyzeReceiptImageJob(runner, {
      jobId: "job-1",
      imageDataUrl: "data:image/jpeg;base64,AA",
    });
    expect(runner.recomputeBatchProgress).toHaveBeenCalledTimes(1);
    expect(runner.recomputeBatchProgress).toHaveBeenCalledWith("batch-1");
  });
});
