// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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

describe("listJobs の並び順", () => {
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

    const jobs = await t.withIdentity(identity).query(api.receiptAnalysisJobs.queries.listJobs, {});

    expect(jobs).toHaveLength(100);
    expect(jobs.map((job) => job._id)).toContain(queuedJobId);
    expect(jobs[0]?._id).toBe(queuedJobId);
  });
});
