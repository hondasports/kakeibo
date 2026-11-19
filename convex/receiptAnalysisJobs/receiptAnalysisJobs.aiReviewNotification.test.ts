// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_RECEIPT_ANALYSIS_BATCH_FILES } from "../../lib/domain/receiptAnalysisJobs/rules";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

// finalizeAnalysisAttempt が予約する60分後の確認を、テスト中に勝手に走らせない。
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const USER_ID = "ai-review-notify-user";
const identity = {
  tokenIdentifier: USER_ID,
  subject: `clerk-${USER_ID}`,
  issuer: "https://issuer.example",
};

type TestT = ReturnType<typeof convexTest>;
type DraftStatus = "needs_review" | "ready" | "registered";

async function seedBatchWithDrafts(t: TestT, draftCount: number) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "確認依頼通知グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const userDocId = await ctx.db.insert("users", {
      userId: USER_ID,
      displayName: "通知ユーザー",
      email: "notify@example.test",
      activeGroupId: groupId,
      notificationPreferences: {
        aiReviewRequiredEmailEnabled: true,
        aiReviewRequiredLineEnabled: true,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: USER_ID,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("lineAccountLinks", {
      userId: USER_ID,
      lineUserId: "line-u-notify",
      status: "active",
      linkedAt: 50,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("notificationSettings", {
      type: "ai_review_required",
      channel: "line",
      enabled: true,
      updatedByUserId: userDocId,
      updatedAt: 1,
    });
    const batchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId,
      createdByUserId: USER_ID,
      totalCount: draftCount,
      processedCount: 0,
      status: "running",
      createdAt: 1,
      updatedAt: 1,
    });
    const jobIds: Id<"receiptAnalysisImageJobs">[] = [];
    const draftIds: Id<"aiExpenseDrafts">[] = [];
    for (let imageIndex = 0; imageIndex < draftCount; imageIndex += 1) {
      jobIds.push(
        await ctx.db.insert("receiptAnalysisImageJobs", {
          batchId,
          groupId,
          imageIndex,
          fileName: `${imageIndex}.jpg`,
          status: "running",
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      draftIds.push(
        await ctx.db.insert("aiExpenseDrafts", {
          groupId,
          createdByUserId: USER_ID,
          sourceType: "image_upload",
          status: "needs_review",
          documentType: "receipt",
          confidence: {},
          reviewReasons: [],
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { groupId, batchId, jobIds, draftIds };
  });
}

/** 解析の完了を本物の mutation で反映し、ジョブを needs_review にして60分後の確認を予約させる。 */
async function finalizeAllAsNeedsReview(
  t: TestT,
  seeded: { jobIds: Id<"receiptAnalysisImageJobs">[]; draftIds: Id<"aiExpenseDrafts">[] },
) {
  for (const [index, jobId] of seeded.jobIds.entries()) {
    const result = await t.mutation(internal.receiptAnalysisJobs.internal.finalizeAnalysisAttempt, {
      jobId,
      expectedDraftId: null,
      newDraftId: seeded.draftIds[index]!,
      status: "needs_review",
    });
    expect(result).toMatchObject({ applied: true });
  }
}

async function readNotificationRows(t: TestT, batchId: Id<"receiptAnalysisBatches">) {
  return await t.run(async (ctx) => ({
    emails: await ctx.db.query("transactionalEmailJobs").collect(),
    lineJobs: await ctx.db.query("lineNotificationJobs").collect(),
    lineEvents: await ctx.db.query("lineNotificationEvents").collect(),
    batch: await ctx.db.get(batchId),
  }));
}

async function runCheck(t: TestT, batchId: Id<"receiptAnalysisBatches">) {
  await t.action(internal.receiptAnalysisJobs.actions.checkAiReviewRequired, { batchId });
  return await readNotificationRows(t, batchId);
}

/** 通知を積む mutation を直接呼ぶ。件数は引数でなく、mutation の中で下書きから数える。 */
async function runEnqueue(t: TestT, batchId: Id<"receiptAnalysisBatches">) {
  await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
    batchId,
    userId: USER_ID,
  });
  return await readNotificationRows(t, batchId);
}

async function setDraftStatus(t: TestT, draftId: Id<"aiExpenseDrafts">, status: DraftStatus) {
  // 確認・登録の mutation は明細・カテゴリ等の前提データが多いため、状態だけを直接書き換える。
  await t.run(async (ctx) => {
    await ctx.db.patch(draftId, { status, updatedAt: 2 });
  });
}

describe("確認依頼の通知件数は、下書きの状態で決まる", () => {
  it("確認待ちの下書きが残っていれば、その件数でメールと LINE を積む", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 2);
    await finalizeAllAsNeedsReview(t, seeded);

    const rows = await runCheck(t, seeded.batchId);

    expect(rows.emails).toHaveLength(1);
    expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({ pendingCount: 2 });
    expect(rows.lineJobs).toHaveLength(1);
    expect(rows.lineJobs[0]).toMatchObject({ pendingCount: 2, status: "queued" });
    expect(rows.lineEvents).toHaveLength(1);
    expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeDefined();
  });

  it("確認待ちの下書きを全て削除したら、メールも LINE も積まず、重複防止も立てない", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 1);
    await finalizeAllAsNeedsReview(t, seeded);
    await expect(
      t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.deleteDraft, { draftId: seeded.draftIds[0]! }),
    ).resolves.toEqual({ deleted: true });

    const rows = await runCheck(t, seeded.batchId);

    expect(rows.emails).toHaveLength(0);
    expect(rows.lineJobs).toHaveLength(0);
    expect(rows.lineEvents).toHaveLength(0);
    expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeUndefined();
  });

  it.each(["ready", "registered"] as const)(
    "確認待ちの下書きが全て %s になっていたら、メールも LINE も積まない",
    async (status) => {
      const t = convexTest(schema, convexTestModules);
      const seeded = await seedBatchWithDrafts(t, 1);
      await finalizeAllAsNeedsReview(t, seeded);
      await setDraftStatus(t, seeded.draftIds[0]!, status);

      const rows = await runCheck(t, seeded.batchId);

      expect(rows.emails).toHaveLength(0);
      expect(rows.lineJobs).toHaveLength(0);
      expect(rows.lineEvents).toHaveLength(0);
      expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeUndefined();
    },
  );

  it("2件中1件だけ確認待ちが残るときは、残った1件で通知する", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 2);
    await finalizeAllAsNeedsReview(t, seeded);
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.deleteDraft, { draftId: seeded.draftIds[0]! });

    const rows = await runCheck(t, seeded.batchId);

    expect(rows.emails).toHaveLength(1);
    expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({ pendingCount: 1 });
    expect(rows.lineJobs).toHaveLength(1);
    expect(rows.lineJobs[0]).toMatchObject({ pendingCount: 1 });
  });

  it("バッチと違うグループの下書きは数えない", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 1);
    await finalizeAllAsNeedsReview(t, seeded);
    await t.run(async (ctx) => {
      const otherGroupId = await ctx.db.insert("groups", {
        name: "別グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(seeded.draftIds[0]!, { groupId: otherGroupId });
    });

    const rows = await runCheck(t, seeded.batchId);

    expect(rows.emails).toHaveLength(0);
    expect(rows.lineJobs).toHaveLength(0);
    expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeUndefined();
  });

  it("1バッチのジョブ上限（10件）を超えて下書きを読まない", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, MAX_RECEIPT_ANALYSIS_BATCH_FILES + 1);
    await finalizeAllAsNeedsReview(t, seeded);

    const rows = await runCheck(t, seeded.batchId);

    expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({
      pendingCount: MAX_RECEIPT_ANALYSIS_BATCH_FILES,
    });
  });

  it.each(["ready", "failed", "running"] as const)(
    "下書きが確認待ちのままなら、ジョブが %s でも下書きを数えて通知する",
    async (jobStatus) => {
      const t = convexTest(schema, convexTestModules);
      const seeded = await seedBatchWithDrafts(t, 2);
      await finalizeAllAsNeedsReview(t, seeded);
      await t.run(async (ctx) => {
        await ctx.db.patch(seeded.jobIds[0]!, { status: jobStatus, updatedAt: 2 });
      });

      const rows = await runCheck(t, seeded.batchId);

      expect(rows.emails).toHaveLength(1);
      expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({ pendingCount: 2 });
      expect(rows.lineJobs[0]).toMatchObject({ pendingCount: 2 });
    },
  );

  it("通知を積む mutation を直接呼んでも、確認待ちの下書きが0件なら何も積まない", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 2);
    await finalizeAllAsNeedsReview(t, seeded);
    // 件数を数えた後に下書きが確認された状況と同じく、mutation が呼ばれる時点で下書きは確認済み
    await setDraftStatus(t, seeded.draftIds[0]!, "ready");
    await setDraftStatus(t, seeded.draftIds[1]!, "registered");

    const rows = await runEnqueue(t, seeded.batchId);

    expect(rows.emails).toHaveLength(0);
    expect(rows.lineJobs).toHaveLength(0);
    expect(rows.lineEvents).toHaveLength(0);
    expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeUndefined();
  });

  it("通知を積む mutation は、呼ばれた時点の下書きの数で通知する", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 3);
    await finalizeAllAsNeedsReview(t, seeded);
    await setDraftStatus(t, seeded.draftIds[0]!, "ready");

    const rows = await runEnqueue(t, seeded.batchId);

    expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({ pendingCount: 2 });
    expect(rows.lineJobs[0]).toMatchObject({ pendingCount: 2 });
  });

  it("旧コードが pendingCount を付けて呼んでも弾かれず、付けた値でなく数えた件数で通知する", async () => {
    const t = convexTest(schema, convexTestModules);
    const seeded = await seedBatchWithDrafts(t, 2);
    await finalizeAllAsNeedsReview(t, seeded);

    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId: seeded.batchId,
      userId: USER_ID,
      pendingCount: 7,
    });
    const rows = await readNotificationRows(t, seeded.batchId);

    expect(JSON.parse(rows.emails[0]!.payloadJson)).toEqual({ pendingCount: 2 });
    expect(rows.lineJobs[0]).toMatchObject({ pendingCount: 2 });
  });
});
