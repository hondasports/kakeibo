// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

type T = ReturnType<typeof convexTest>;

async function seedUser(t: T, userId: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { userId, displayName: "存在", createdAt: 1, updatedAt: 1 });
  });
}

/** link 2本（active+revoked）と、それを参照する job / event / request / audit を作る。 */
async function seedLineData(t: T, userId: string, extraJobs = 0) {
  await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "g",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const batchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId,
      createdByUserId: userId,
      totalCount: 1,
      processedCount: 1,
      status: "completed",
      createdAt: 1,
      updatedAt: 1,
    });
    const activeLinkId = await ctx.db.insert("lineAccountLinks", {
      userId,
      lineUserId: `line-${userId}-a`,
      status: "active",
      linkedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("lineAccountLinks", {
      userId,
      lineUserId: `line-${userId}-r`,
      status: "revoked",
      linkedAt: 1,
      revokedAt: 2,
      createdAt: 1,
      updatedAt: 2,
    });
    for (let i = 0; i < 1 + extraJobs; i += 1) {
      await ctx.db.insert("lineNotificationJobs", {
        userId,
        batchId,
        type: "ai_review_required",
        pendingCount: 1,
        linkId: activeLinkId,
        linkedAtSnapshot: 1,
        lineUserIdSnapshot: `line-${userId}-a`,
        text: "通知",
        status: "queued",
        attemptCount: 0,
        createdAt: 1 + i,
        updatedAt: 1,
      });
    }
    await ctx.db.insert("lineNotificationEvents", {
      userId,
      batchId,
      type: "ai_review_required",
      dedupeKey: `dedupe-${userId}`,
      outcome: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("lineLinkRequests", {
      userId,
      stateHash: `state-${userId}`,
      nonceHash: "n",
      codeVerifier: "c",
      status: "pending",
      expiresAt: 10,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("lineLinkAuditLogs", {
      userId,
      action: "linked",
      result: "success",
      createdAt: 1,
    });
  });
}

const tableCounts = async (t: T, userId: string) =>
  await t.run(async (ctx) => {
    const byUser = (table: "lineNotificationJobs" | "lineNotificationEvents") =>
      ctx.db
        .query(table)
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .collect();
    return {
      links: (
        await ctx.db
          .query("lineAccountLinks")
          .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      jobs: (await byUser("lineNotificationJobs")).length,
      events: (await byUser("lineNotificationEvents")).length,
      requests: (
        await ctx.db
          .query("lineLinkRequests")
          .withIndex("by_user_id_and_expires_at", (q) => q.eq("userId", userId))
          .collect()
      ).length,
      audits: (
        await ctx.db
          .query("lineLinkAuditLogs")
          .withIndex("by_user_id", (q) => q.eq("userId", userId))
          .collect()
      ).length,
    };
  });

/** 自己再スケジュールの代わりに、cursor を手動で渡して最後まで実行する。 */
async function runAll(t: T) {
  const results = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i += 1) {
    const r = await t.mutation(internal.orphanedLineLinkMigration.executeBatch, { cursor });
    results.push(r);
    if (r.isDone) break;
    cursor = r.continueCursor ?? undefined;
  }
  return results;
}

const full = { links: 2, jobs: 1, events: 1, requests: 1, audits: 1 };
const empty = { links: 0, jobs: 0, events: 0, requests: 0, audits: 0 };

describe("orphaned LINE link migration", () => {
  it("dryRun は孤立データの件数だけを返し、何も削除しない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "issuer|U1");
    await seedLineData(t, "issuer|U1");
    await seedLineData(t, "issuer|O1");

    const r = await t.query(internal.orphanedLineLinkMigration.dryRun, {});
    expect(r).toEqual({
      isDone: true,
      continueCursor: null,
      orphanLinks: 2,
      skippedInProgressDeletion: 0,
      wouldDelete: {
        lineNotificationJobs: 1,
        lineNotificationEvents: 1,
        lineLinkRequests: 1,
        lineLinkAuditLogs: 1,
      },
    });
    expect(JSON.stringify(r)).not.toContain("line-");
    expect(await tableCounts(t, "issuer|O1")).toEqual(full);
  });

  it("複数batchで孤立ユーザーのデータだけを削除し、存在ユーザーは触らず、再実行しても冪等", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "issuer|U1");
    await seedLineData(t, "issuer|U1");
    // 10件/batch を超えて複数batchになるよう孤立ユーザーを増やす。
    for (let i = 0; i < 8; i += 1) await seedLineData(t, `issuer|O${i}`);

    const results = await runAll(t);
    expect(results.length).toBeGreaterThan(1);
    expect(results.reduce((n, r) => n + r.deletedLinks, 0)).toBe(16);

    expect(await tableCounts(t, "issuer|U1")).toEqual(full);
    for (let i = 0; i < 8; i += 1) expect(await tableCounts(t, `issuer|O${i}`)).toEqual(empty);
    await expect(t.query(internal.orphanedLineLinkMigration.verify, {})).resolves.toMatchObject({
      isDone: true,
      remainingOrphanLinks: 0,
    });

    const again = await t.mutation(internal.orphanedLineLinkMigration.executeBatch, {});
    expect(again).toMatchObject({ isDone: true, deletedLinks: 0 });
    expect(await tableCounts(t, "issuer|U1")).toEqual(full);
  });

  it("子データが上限を超えるときは持ち越し、同じcursorで再実行して収束する", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLineData(t, "issuer|O1", 130);

    const first = await t.mutation(internal.orphanedLineLinkMigration.executeBatch, {});
    // 通知jobが上限(50件/リンク)を超えて残る間は、参照先のリンクを消さず持ち越す。
    expect(first).toMatchObject({ isDone: false, deferredLinks: 2, deletedLinks: 0 });
    const mid = await tableCounts(t, "issuer|O1");
    expect(mid.links).toBe(2);
    expect(mid.jobs).toBe(31);

    await runAll(t);
    expect(await tableCounts(t, "issuer|O1")).toEqual(empty);
  });

  it("進行中の退会リクエストがある userId は users 行が無くても削除しない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLineData(t, "issuer|O1");
    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionRequests", {
        userId: "issuer|O1",
        clerkUserId: "clerk-o1",
        status: "identity_deleted",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(t.query(internal.orphanedLineLinkMigration.dryRun, {})).resolves.toMatchObject({
      orphanLinks: 0,
      skippedInProgressDeletion: 2,
    });
    const r = await t.mutation(internal.orphanedLineLinkMigration.executeBatch, {});
    expect(r).toMatchObject({ deletedLinks: 0, skippedLinks: 2 });
    expect(await tableCounts(t, "issuer|O1")).toEqual(full);
  });

  it("完了済みの退会リクエストを持つ孤立ユーザーは削除対象になる", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLineData(t, "issuer|O1");
    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionRequests", {
        userId: "issuer|O1",
        clerkUserId: "clerk-o1",
        status: "completed",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await runAll(t);
    expect(await tableCounts(t, "issuer|O1")).toEqual(empty);
  });
});
