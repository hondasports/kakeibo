// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const TEST_USER_ID = "list-jobs-order-user";
const identity = {
  tokenIdentifier: TEST_USER_ID,
  subject: `clerk-${TEST_USER_ID}`,
  issuer: "https://issuer.example",
};

async function seedGroup(t: ReturnType<typeof convexTest>): Promise<Id<"groups">> {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "ジョブ一覧並び順確認グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: TEST_USER_ID,
      displayName: "キューユーザー",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: TEST_USER_ID,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    return groupId;
  });
}

describe("解析中ジョブの読み込み範囲", () => {
  it("ready のジョブが100件あっても、作成日時が新しい queued のジョブが一覧に含まれる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const queuedJobId = await t.run(async (ctx) => {
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        totalCount: 101,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let i = 0; i < 100; i += 1) {
        await ctx.db.insert("receiptAnalysisImageJobs", {
          batchId,
          groupId,
          imageIndex: i,
          fileName: `receipt-${i}.jpg`,
          status: "ready",
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        });
      }
      return await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId,
        imageIndex: 100,
        fileName: "receipt-queued.jpg",
        status: "queued",
        createdAt: 2000,
        updatedAt: 2000,
      });
    });

    const jobs = await t
      .withIdentity(identity)
      .query(api.receiptAnalysisJobs.queries.listActiveJobs, {});

    expect(jobs).toHaveLength(1);
    expect(jobs.map((job) => job._id)).toContain(queuedJobId);
    expect(jobs[0]?._id).toBe(queuedJobId);
  });
  it("queued / running のみを作成日時の降順で返し、別グループを含めない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    await t.run(async (ctx) => {
      const otherGroupId = await ctx.db.insert("groups", {
        name: "別グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        totalCount: 6,
        processedCount: 4,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      const statuses = [
        "queued",
        "running",
        "ready",
        "needs_review",
        "failed",
        "cancelled",
      ] as const;
      for (const [imageIndex, status] of statuses.entries()) {
        await ctx.db.insert("receiptAnalysisImageJobs", {
          groupId,
          batchId,
          imageIndex,
          fileName: `${status}.jpg`,
          status,
          createdAt: imageIndex + 1,
          updatedAt: 1,
        });
      }
      await ctx.db.insert("receiptAnalysisImageJobs", {
        groupId: otherGroupId,
        batchId,
        imageIndex: 0,
        fileName: "other.jpg",
        status: "queued",
        createdAt: 100,
        updatedAt: 100,
      });
    });
    const jobs = await t
      .withIdentity(identity)
      .query(api.receiptAnalysisJobs.queries.listActiveJobs, {});
    expect(jobs.map((job) => job.status)).toEqual(["running", "queued"]);
    await expect(t.query(api.receiptAnalysisJobs.queries.listActiveJobs, {})).rejects.toThrow();
  });

  it("セッションのバッチは50件を超えても完了ジョブの紐づけを取得できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const batchId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        totalCount: 51,
        processedCount: 51,
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let imageIndex = 0; imageIndex < 51; imageIndex++) {
        await ctx.db.insert("receiptAnalysisImageJobs", {
          groupId,
          batchId: id,
          imageIndex,
          fileName: `${imageIndex}.jpg`,
          status: "ready",
          createdAt: imageIndex,
          updatedAt: 1,
        });
      }
      return id;
    });
    const jobs = await t
      .withIdentity(identity)
      .query(api.receiptAnalysisJobs.queries.listJobsByBatch, { batchId });
    expect(jobs).toHaveLength(51);
  });
});

describe("解析中ジョブの読み込み範囲", () => {
  it("完了済みと他グループを除き、古い queued / running も作成日時順で返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const activeIds = await t.run(async (ctx) => {
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        totalCount: 106,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      const insert = (
        status: "queued" | "running" | "ready" | "needs_review" | "failed" | "cancelled",
        createdAt: number,
        jobGroupId = groupId,
      ) =>
        ctx.db.insert("receiptAnalysisImageJobs", {
          batchId,
          groupId: jobGroupId,
          imageIndex: createdAt,
          fileName: `${createdAt}.jpg`,
          status,
          createdAt,
          updatedAt: createdAt,
        });
      const queued = await insert("queued", 1);
      const running = await insert("running", 2);
      for (let i = 0; i < 100; i += 1) await insert("ready", 100 + i);
      for (const status of ["needs_review", "failed", "cancelled"] as const)
        await insert(status, 300);
      const otherGroup = await ctx.db.insert("groups", {
        name: "別グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await insert("running", 400, otherGroup);
      return [running, queued];
    });
    const jobs = await t
      .withIdentity(identity)
      .query(api.receiptAnalysisJobs.queries.listActiveJobs, {});
    expect(jobs.map((job) => job._id)).toEqual(activeIds);
  });

  it.each(["createReceiptAnalysisReader", "createReceiptAnalysisStore"] as const)(
    "%s は queued / running を status index の範囲で読む",
    async (factoryName) => {
      const { [factoryName]: createStore } =
        await import("../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore");
      const eq = vi.fn();
      const range = { eq };
      eq.mockReturnValue(range);
      const take = vi.fn().mockResolvedValue([]);
      const withIndex = vi.fn((_index, buildRange) => {
        buildRange(range);
        return { order: () => ({ take }) };
      });
      const ctx = { db: { query: vi.fn(() => ({ withIndex })) } };
      const store = createStore(ctx as unknown as Parameters<typeof createStore>[0]);
      await store.listActiveJobsByGroup("group-1", 100);
      expect(withIndex.mock.calls.map(([index]) => index)).toEqual([
        "by_group_id_and_status",
        "by_group_id_and_status",
      ]);
      expect(eq.mock.calls).toEqual([
        ["groupId", "group-1"],
        ["status", "queued"],
        ["groupId", "group-1"],
        ["status", "running"],
      ]);
    },
  );
});

async function seedDraftJobLookup(t: ReturnType<typeof convexTest>) {
  const groupId = await seedGroup(t);
  return t.run(async (ctx) => {
    const otherGroupId = await ctx.db.insert("groups", {
      name: "別グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const batchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId,
      totalCount: 4,
      processedCount: 4,
      status: "completed",
      createdAt: 1,
      updatedAt: 1,
    });
    const draftIds: Id<"aiExpenseDrafts">[] = [];
    const allowedJobIds: Id<"receiptAnalysisImageJobs">[] = [];
    const pairs = [
      [groupId, groupId],
      [groupId, groupId],
      [otherGroupId, otherGroupId],
      [groupId, otherGroupId],
      [otherGroupId, groupId],
    ];
    for (const [imageIndex, [draftGroupId, jobGroupId]] of pairs.entries()) {
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: draftGroupId,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "unknown",
        confidence: {},
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
      });
      draftIds.push(draftId);
      const jobId = await ctx.db.insert("receiptAnalysisImageJobs", {
        groupId: jobGroupId,
        batchId,
        draftId,
        imageIndex,
        fileName: `${imageIndex}.png`,
        status: "needs_review",
        createdAt: 1,
        updatedAt: 1,
      });
      if (jobGroupId === groupId) allowedJobIds.push(jobId);
    }
    const missingDraftId = await ctx.db.insert("aiExpenseDrafts", {
      groupId,
      sourceType: "image_upload",
      status: "failed",
      documentType: "unknown",
      confidence: {},
      reviewReasons: [],
      createdAt: 1,
      updatedAt: 1,
    });
    draftIds.push(missingDraftId);
    await ctx.db.delete(missingDraftId);
    return { draftIds, allowedJobIds };
  });
}

describe("下書きIDをまとめたジョブ取得", () => {
  it("複数IDを取得し、別グループのジョブと未紐づけのIDを返さない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { draftIds, allowedJobIds } = await seedDraftJobLookup(t);
    const jobs = await t
      .withIdentity(identity)
      .query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, { draftIds });
    expect(jobs.map((job) => job._id)).toEqual(allowedJobIds);
  });

  it("200件までは受け付けて重複を除き、201件は拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { draftIds, allowedJobIds } = await seedDraftJobLookup(t);
    const authed = t.withIdentity(identity);
    const ids = Array<Id<"aiExpenseDrafts">>(200).fill(draftIds[0]);
    const jobs = await authed.query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, {
      draftIds: ids,
    });
    expect(jobs.map((job) => job._id)).toEqual([allowedJobIds[0]]);
    await expect(
      authed.query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, {
        draftIds: [...ids, draftIds[0]],
      }),
    ).rejects.toThrow("200");
    await expect(
      authed.query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, { draftIds: [] }),
    ).resolves.toEqual([]);
  });

  it("未認証またはグループ未所属のユーザーは取得できない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { draftIds } = await seedDraftJobLookup(t);
    await expect(
      t.query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, { draftIds }),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity({ ...identity, tokenIdentifier: "non-member", subject: "non-member" })
        .query(api.receiptAnalysisJobs.queries.listJobsByDraftIds, { draftIds }),
    ).rejects.toThrow();
  });
});
