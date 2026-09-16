import { describe, expect, it } from "vitest";
import type { ReceiptAnalysisJobRecord } from "./records";
import {
  canCancelReceiptAnalysisJob,
  canRetryReceiptAnalysisJob,
  clampReceiptAnalysisCleanupLimit,
  resolveReceiptAnalysisBatchStatus,
  shouldScheduleAiReviewNotification,
} from "./rules";

const job = (status: ReceiptAnalysisJobRecord["status"]): ReceiptAnalysisJobRecord => ({
  id: status,
  creationTime: 1,
  batchId: "batch",
  groupId: "group",
  imageIndex: 0,
  fileName: "receipt.jpg",
  status,
  createdAt: 1,
  updatedAt: 1,
});

describe("job operations", () => {
  it("failedとneeds_reviewだけretryできる", () => {
    expect(canRetryReceiptAnalysisJob("failed")).toBe(true);
    expect(canRetryReceiptAnalysisJob("needs_review")).toBe(true);
    expect(canRetryReceiptAnalysisJob("queued")).toBe(false);
  });

  it("readyとneeds_reviewは直接cancelできない", () => {
    expect(canCancelReceiptAnalysisJob("ready")).toBe(false);
    expect(canCancelReceiptAnalysisJob("needs_review")).toBe(false);
    expect(canCancelReceiptAnalysisJob("running")).toBe(true);
  });
});

describe("batch completion", () => {
  it("全件処理済みかつ非実行中の場合だけ最終状態を返す", () => {
    expect(resolveReceiptAnalysisBatchStatus(1, 2, [])).toBeUndefined();
    expect(resolveReceiptAnalysisBatchStatus(2, 2, [job("running")])).toBeUndefined();
    expect(resolveReceiptAnalysisBatchStatus(2, 2, [job("ready"), job("cancelled")])).toBe(
      "completed",
    );
    expect(resolveReceiptAnalysisBatchStatus(2, 2, [job("ready"), job("failed")])).toBe(
      "partially_failed",
    );
  });
});

describe("notification and cleanup", () => {
  it("terminalかつ未予約の場合だけ通知する", () => {
    expect(shouldScheduleAiReviewNotification("needs_review", false)).toBe(true);
    expect(shouldScheduleAiReviewNotification("running", false)).toBe(false);
    expect(shouldScheduleAiReviewNotification("failed", true)).toBe(false);
  });

  it("cleanup limitを1から100へ制限する", () => {
    expect(clampReceiptAnalysisCleanupLimit(0)).toBe(1);
    expect(clampReceiptAnalysisCleanupLimit(25.9)).toBe(25);
    expect(clampReceiptAnalysisCleanupLimit(101)).toBe(100);
  });
});
