// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const USER_ID = "user-1";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
});

type TestT = ReturnType<typeof convexTest>;

async function seedTwoGroups(
  t: TestT,
  options: {
    activeGroup?: "a" | "b";
    memberGroups?: Array<"a" | "b">;
    groupAStatus?: "active" | "deleted";
  } = {},
) {
  return await t.run(async (ctx) => {
    const groupAId = await ctx.db.insert("groups", {
      name: "group-a",
      status: options.groupAStatus ?? "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const groupBId = await ctx.db.insert("groups", {
      name: "group-b",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    for (const key of options.memberGroups ?? ["a", "b"]) {
      await ctx.db.insert("groupMembers", {
        groupId: key === "a" ? groupAId : groupBId,
        userId: USER_ID,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const activeGroupId =
      options.activeGroup === "a" ? groupAId : options.activeGroup === "b" ? groupBId : undefined;
    await ctx.db.insert("users", {
      userId: USER_ID,
      displayName: USER_ID,
      createdAt: 1,
      updatedAt: 1,
      ...(activeGroupId === undefined ? {} : { activeGroupId }),
    });
    const categoryAId = await ctx.db.insert("categories", {
      groupId: groupAId,
      name: "食費A",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const categoryBId = await ctx.db.insert("categories", {
      groupId: groupBId,
      name: "食費B",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupAId, groupBId, categoryAId, categoryBId };
  });
}

const extractionArgs = {
  documentType: "receipt" as const,
  shopName: "テスト店",
  confidence: {},
  warnings: [],
};

async function listDrafts(t: TestT) {
  return await t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect());
}

describe("receipt 画像解析の group pin", () => {
  it("active group が B でも pin した group A に下書きを保存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId, groupBId } = await seedTwoGroups(t, { activeGroup: "b" });

    const draft = await t
      .withIdentity(identity(USER_ID))
      .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
        groupId: groupAId,
        ...extractionArgs,
      });

    expect(draft.groupId).toBe(groupAId);
    const drafts = await listDrafts(t);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.groupId).toBe(groupAId);
    expect(drafts[0]?.groupId).not.toBe(groupBId);
  });

  it("処理中に pin 先 group の所属を失ったら保存を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, { activeGroup: "a" });
    // 処理中に A の所属が外れた状態を再現する
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_user_id", (q) =>
          q.eq("groupId", groupAId).eq("userId", USER_ID),
        )
        .unique();
      if (member !== null) await ctx.db.delete(member._id);
    });

    await expect(
      t
        .withIdentity(identity(USER_ID))
        .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
          groupId: groupAId,
          ...extractionArgs,
        }),
    ).rejects.toThrow("グループに所属していません");

    expect(await listDrafts(t)).toHaveLength(0);
  });

  it("所属していない group を pin しても保存を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, { activeGroup: "b", memberGroups: ["b"] });

    await expect(
      t
        .withIdentity(identity(USER_ID))
        .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
          groupId: groupAId,
          ...extractionArgs,
        }),
    ).rejects.toThrow("グループに所属していません");

    expect(await listDrafts(t)).toHaveLength(0);
  });

  it("pin 先 group が削除済みなら保存を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, {
      activeGroup: "a",
      groupAStatus: "deleted",
    });

    await expect(
      t
        .withIdentity(identity(USER_ID))
        .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
          groupId: groupAId,
          ...extractionArgs,
        }),
    ).rejects.toThrow("グループに所属していません");

    expect(await listDrafts(t)).toHaveLength(0);
  });

  it("失敗下書きも pin した group にだけ保存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId, groupBId } = await seedTwoGroups(t, { activeGroup: "b" });

    const draft = await t
      .withIdentity(identity(USER_ID))
      .mutation(internal.aiExpenseDrafts.internal.createFailedDraftFromImageAnalysis, {
        groupId: groupAId,
        warning: "画像解析に失敗しました",
        imageFileName: "receipt.jpg",
      });

    expect(draft.groupId).toBe(groupAId);
    expect(draft.groupId).not.toBe(groupBId);
    expect(draft.status).toBe("failed");
  });

  it("ForUser mutation も pin した group の現在所属を検証する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, { activeGroup: "b" });

    // active=B でも pin=A の所属があれば A に保存される
    const draft = await t.mutation(internal.aiExpenseDrafts.internal.createFromExtractionForUser, {
      userId: USER_ID,
      groupId: groupAId,
      ...extractionArgs,
    });
    expect(draft.groupId).toBe(groupAId);

    // 所属しないユーザー・group の組み合わせは拒否する
    const outsiderId = "user-outsider";
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: outsiderId,
        displayName: outsiderId,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t.mutation(internal.aiExpenseDrafts.internal.createFromExtractionForUser, {
        userId: outsiderId,
        groupId: groupAId,
        ...extractionArgs,
      }),
    ).rejects.toThrow("グループに所属していません");

    expect(await listDrafts(t)).toHaveLength(1);
  });

  it("listActiveForGroup は pin した group のカテゴリだけを返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId, categoryAId, categoryBId } = await seedTwoGroups(t, {
      activeGroup: "b",
    });

    const categories = await t
      .withIdentity(identity(USER_ID))
      .query(internal.categories.internal.listActiveForGroup, { groupId: groupAId });

    expect(categories.map((category) => category._id)).toEqual([categoryAId]);
    expect(categories.map((category) => category._id)).not.toContain(categoryBId);
  });

  it("listActiveForGroup は所属しない group を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, { activeGroup: "b", memberGroups: ["b"] });

    await expect(
      t.withIdentity(identity(USER_ID)).query(internal.categories.internal.listActiveForGroup, {
        groupId: groupAId,
      }),
    ).rejects.toThrow("グループに所属していません");
  });

  it("finalize は job と同じ group の draft を正常に紐づける", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId } = await seedTwoGroups(t, { activeGroup: "a" });
    const { jobId, draftId } = await t.run(async (ctx) => {
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId: groupAId,
        createdByUserId: USER_ID,
        totalCount: 1,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId: groupAId,
        imageIndex: 0,
        fileName: "receipt.jpg",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: groupAId,
        createdByUserId: USER_ID,
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        confidence: {},
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
      });
      return { jobId, draftId };
    });

    const result = await t.mutation(internal.receiptAnalysisJobs.internal.finalizeAnalysisAttempt, {
      jobId,
      groupId: groupAId,
      expectedDraftId: null,
      newDraftId: draftId,
      status: "ready",
    });

    expect(result).toEqual({ applied: true });
    const job = await t.run(async (ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "ready", draftId });
    expect(await listDrafts(t)).toHaveLength(1);
  });

  it("finalize は job と異なる group の draft を拒否して job を failed にする", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupAId, groupBId } = await seedTwoGroups(t, { activeGroup: "a" });
    const { jobId, misplacedDraftId } = await t.run(async (ctx) => {
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId: groupAId,
        createdByUserId: USER_ID,
        totalCount: 1,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId: groupAId,
        imageIndex: 0,
        fileName: "receipt.jpg",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      // job の group と異なる group に保存された draft（旧来の不具合で起こり得た状態）
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: groupBId,
        createdByUserId: USER_ID,
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        confidence: {},
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
      });
      return { jobId, misplacedDraftId: draftId };
    });

    const result = await t.mutation(internal.receiptAnalysisJobs.internal.finalizeAnalysisAttempt, {
      jobId,
      groupId: groupAId,
      expectedDraftId: null,
      newDraftId: misplacedDraftId,
      status: "ready",
    });

    expect(result).toEqual({ applied: true });
    const job = await t.run(async (ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed" });
    expect(job?.draftId).toBeUndefined();
    // 誤って別 group に保存された draft は残さず削除する
    expect(await listDrafts(t)).toHaveLength(0);
  });
});
