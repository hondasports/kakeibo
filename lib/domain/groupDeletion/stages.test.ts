import { describe, expect, it } from "vitest";
import {
  canRunAfterGroupDeletion,
  GROUP_DELETION_PURGE_STAGES,
  initialStageForJob,
  isPurgeStage,
  isTerminalJobStatus,
  nextDeletionStage,
  usesRecipientNotifications,
} from "./stages";
import { accumulateDeletedCounts, incrementGroupDeletedCount, zeroDeletedCounts } from "./counts";
import { decideBatchEntry, evaluateResumeEligibility, resumeResetPatch } from "./jobTransitions";
import { boundedPreview, deriveReceiptImageCount } from "./impact";

describe("stages", () => {
  it("purge順序は既存レジストリと同一", () => {
    expect(GROUP_DELETION_PURGE_STAGES).toEqual([
      "receiptAnalysisImageJobs",
      "aiExpenseDraftItems",
      "aiExpenseDrafts",
      "receiptAnalysisBatches",
      "expenseEntries",
      "receipts",
      "sourceDocuments",
      "weekSessions",
      "categories",
      "groupInvitations",
      "managementAuditLogs",
      "groupMembers",
    ]);
  });

  it("nextDeletionStage は purge → finalSweep → completedEnqueue → recipientCleanup と進む", () => {
    expect(nextDeletionStage("receiptAnalysisImageJobs")).toBe("aiExpenseDraftItems");
    expect(nextDeletionStage("groupMembers")).toBe("finalSweep");
    expect(nextDeletionStage("finalSweep")).toBe("completedEnqueue");
    expect(nextDeletionStage("completedEnqueue")).toBe("recipientCleanup");
    expect(nextDeletionStage("recipientCleanup")).toBe("recipientCleanup");
  });

  it("isPurgeStage は purge 対象のみ true", () => {
    expect(isPurgeStage("expenseEntries")).toBe(true);
    expect(isPurgeStage("finalSweep")).toBe(false);
    expect(isPurgeStage("recipientSnapshot")).toBe(false);
  });

  it("canRunAfterGroupDeletion は finalSweep/completedEnqueue/recipientCleanup のみ true", () => {
    expect(canRunAfterGroupDeletion("finalSweep")).toBe(true);
    expect(canRunAfterGroupDeletion("completedEnqueue")).toBe(true);
    expect(canRunAfterGroupDeletion("recipientCleanup")).toBe(true);
    expect(canRunAfterGroupDeletion("categories")).toBe(false);
    expect(canRunAfterGroupDeletion("startedEnqueue")).toBe(false);
  });

  it("initialStageForJob は owner+actor のみ recipientSnapshot", () => {
    expect(initialStageForJob("owner", "issuer|u1")).toBe("recipientSnapshot");
    expect(initialStageForJob("owner", undefined)).toBe("receiptAnalysisImageJobs");
    expect(initialStageForJob("account_deletion", "issuer|u1")).toBe("receiptAnalysisImageJobs");
    expect(initialStageForJob("e2e_cleanup", undefined)).toBe("receiptAnalysisImageJobs");
  });

  it("usesRecipientNotifications は owner+actor のみ true", () => {
    expect(usesRecipientNotifications("owner", "issuer|u1")).toBe(true);
    expect(usesRecipientNotifications("owner", undefined)).toBe(false);
    expect(usesRecipientNotifications("account_deletion", "issuer|u1")).toBe(false);
  });

  it("isTerminalJobStatus は completed/failed のみ true", () => {
    expect(isTerminalJobStatus("completed")).toBe(true);
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("retry_wait")).toBe(false);
    expect(isTerminalJobStatus("running")).toBe(false);
  });
});

describe("counts", () => {
  it("zeroDeletedCounts は全キー 0", () => {
    const counts = zeroDeletedCounts();
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
    expect(counts).toHaveProperty("storageFiles");
    expect(counts).toHaveProperty("groups");
  });

  it("accumulateDeletedCounts はステージとstorageFilesを累積する", () => {
    const base = { ...zeroDeletedCounts(), receipts: 3, storageFiles: 1 };
    const next = accumulateDeletedCounts(base, "receipts", {
      deleted: 5,
      storageFiles: 2,
    });
    expect(next.receipts).toBe(8);
    expect(next.storageFiles).toBe(3);
    expect(next.categories).toBe(0);
    expect(base.receipts).toBe(3);
  });

  it("incrementGroupDeletedCount は groups のみ +1", () => {
    const next = incrementGroupDeletedCount(zeroDeletedCounts());
    expect(next.groups).toBe(1);
    expect(next.receipts).toBe(0);
  });
});

describe("jobTransitions", () => {
  it("decideBatchEntry: 終端ステータスは skip", () => {
    expect(decideBatchEntry({ status: "completed" }, 100)).toEqual({ kind: "skip" });
    expect(decideBatchEntry({ status: "failed" }, 100)).toEqual({ kind: "skip" });
  });

  it("decideBatchEntry: retry_wait の未来時刻は残り時間で reschedule", () => {
    expect(decideBatchEntry({ status: "retry_wait", nextRetryAt: 61_000 }, 1_000)).toEqual({
      kind: "reschedule",
      delayMs: 60_000,
    });
  });

  it("decideBatchEntry: retry_wait でも期限切れ/時刻なしは proceed", () => {
    expect(decideBatchEntry({ status: "retry_wait", nextRetryAt: 500 }, 1_000)).toEqual({
      kind: "proceed",
    });
    expect(decideBatchEntry({ status: "retry_wait" }, 1_000)).toEqual({ kind: "proceed" });
    expect(decideBatchEntry({ status: "running" }, 1_000)).toEqual({ kind: "proceed" });
  });

  it("evaluateResumeEligibility: failed 以外は not_failed", () => {
    expect(
      evaluateResumeEligibility(
        { status: "running", stage: "categories" },
        { groupMissing: false, groupStatus: "deleting", hasActiveJobForTarget: false },
      ),
    ).toEqual({ kind: "not_failed" });
  });

  it("evaluateResumeEligibility: グループ不在は post-deletion ステージのみ許可", () => {
    expect(
      evaluateResumeEligibility(
        { status: "failed", stage: "categories" },
        { groupMissing: true, hasActiveJobForTarget: false },
      ),
    ).toEqual({ kind: "group_state_invalid" });
    expect(
      evaluateResumeEligibility(
        { status: "failed", stage: "finalSweep" },
        { groupMissing: true, hasActiveJobForTarget: false },
      ),
    ).toEqual({ kind: "allowed" });
  });

  it("evaluateResumeEligibility: グループ存在時は deleting 必須（status未定義も reject）", () => {
    expect(
      evaluateResumeEligibility(
        { status: "failed", stage: "finalSweep" },
        { groupMissing: false, groupStatus: "active", hasActiveJobForTarget: false },
      ),
    ).toEqual({ kind: "group_state_invalid" });
    expect(
      evaluateResumeEligibility(
        { status: "failed", stage: "finalSweep" },
        { groupMissing: false, groupStatus: undefined, hasActiveJobForTarget: false },
      ),
    ).toEqual({ kind: "group_state_invalid" });
    expect(
      evaluateResumeEligibility(
        { status: "failed", stage: "categories" },
        { groupMissing: false, groupStatus: "deleting", hasActiveJobForTarget: true },
      ),
    ).toEqual({ kind: "already_active" });
  });

  it("resumeResetPatch は requested へ戻しリトライ/完了フィールドを消す", () => {
    expect(resumeResetPatch(42)).toEqual({
      status: "requested",
      isActive: true,
      attemptCount: 0,
      nextRetryAt: undefined,
      lastErrorCategory: undefined,
      completedAt: undefined,
      updatedAt: 42,
    });
  });
});

describe("impact", () => {
  it("boundedPreview: limit 超過は at_least で打ち切る", () => {
    const docs = Array.from({ length: 101 }, (_, i) => ({ i }));
    const preview = boundedPreview(docs, 100);
    expect(preview.result).toEqual({ count: 100, accuracy: "at_least" });
    expect(preview.documents).toHaveLength(100);
  });

  it("boundedPreview: limit 以内は exact", () => {
    const preview = boundedPreview([{ i: 1 }], 100);
    expect(preview.result).toEqual({ count: 1, accuracy: "exact" });
  });

  it("deriveReceiptImageCount: sourceDocuments が inexact なら unknown", () => {
    const inexact = boundedPreview(
      Array.from({ length: 101 }, () => ({ imageStorageId: "s" })),
      100,
    );
    expect(deriveReceiptImageCount(inexact)).toEqual({ count: 0, accuracy: "unknown" });
  });

  it("deriveReceiptImageCount: exact なら imageStorageId 有の件数を exact で返す", () => {
    const exact = boundedPreview([{ imageStorageId: "s1" }, {}, { imageStorageId: "s2" }], 100);
    expect(deriveReceiptImageCount(exact)).toEqual({ count: 2, accuracy: "exact" });
  });
});
