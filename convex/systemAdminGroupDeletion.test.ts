// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";
import { zeroDeletedCounts } from "./groups/groupDeletion.test.fixtures";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
});

describe("system admin group deletion operations", () => {
  // APP_ENV 未設定は fail-closed のため、環境ラベルを明示して検証する
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("一覧は家計内容とactor snapshotを返さず、failed jobを再開して監査する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { jobId } = await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", {
        userId: "admin",
        displayName: "管理者",
        email: "admin@example.test",
        createdAt: 1,
        updatedAt: 1,
      });
      const group = await ctx.db.insert("groups", {
        name: "再開対象",
        status: "deleting",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("systemAdmins", {
        userId: admin,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "test",
      });
      const jobId = await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: group,
        targetGroupNameSnapshot: "再開対象",
        source: "owner",
        actorUserIdSnapshot: "issuer|owner",
        status: "failed",
        stage: "categories",
        isActive: false,
        attemptCount: 6,
        maxAttempts: 6,
        lastErrorCategory: "secret-leak-should-not-show",
        deletedCounts: zeroDeletedCounts(),
        createdAt: 1,
        updatedAt: 1,
      });
      return { jobId };
    });

    const admin = t.withIdentity(identity("admin"));
    const page = await admin.query(api.systemAdminGroupDeletion.listGroupDeletionJobs, {
      paginationOpts: { numItems: 10, cursor: null },
      status: "failed",
    });
    expect(page.page[0]).toMatchObject({
      jobId,
      targetGroupNameSnapshot: "再開対象",
      lastErrorCategory: "unknown",
    });
    expect(page.page[0]).not.toHaveProperty("actorUserIdSnapshot");

    await admin.mutation(api.systemAdminGroupDeletion.resumeGroupDeletion, {
      jobId,
      reason: "失敗原因を確認し、同じstageから再開",
    });
    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      audit: await ctx.db.query("systemAdminAuditLogs").take(10),
    }));
    expect(state.job).toMatchObject({ status: "requested", isActive: true, attemptCount: 0 });
    expect(state.audit[0]).toMatchObject({
      action: "system_admin_group_deletion_resumed",
      targetKind: "group",
      reason: "失敗原因を確認し、同じstageから再開",
    });
  });

  it("APP_ENVが未設定・不正なら一覧を拒否する（developmentへフォールバックしない）", async () => {
    const t = convexTest(schema, convexTestModules);
    for (const appEnv of ["", "prod", "Production"]) {
      vi.stubEnv("APP_ENV", appEnv);
      await expect(
        t
          .withIdentity(identity("admin"))
          .query(api.systemAdminGroupDeletion.listGroupDeletionJobs, {
            paginationOpts: { numItems: 10, cursor: null },
            status: "failed",
          }),
      ).rejects.toThrow("APP_ENVが正しく設定されていません");
    }
  });

  it("system admin以外は一覧・再開できない", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(
      t.withIdentity(identity("member")).query(api.systemAdminGroupDeletion.listGroupDeletionJobs, {
        paginationOpts: { numItems: 10, cursor: null },
        status: "failed",
      }),
    ).rejects.toThrow("システム管理者権限が必要です");
  });

  it("再開理由はtrim後1〜500文字を要求する", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", {
        userId: "reason-admin",
        displayName: "管理者",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("systemAdmins", {
        userId: admin,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "test",
      });
      return await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: "missing-group",
        targetGroupNameSnapshot: "対象",
        source: "account_deletion",
        status: "failed",
        stage: "finalSweep",
        isActive: false,
        attemptCount: 1,
        maxAttempts: 6,
        deletedCounts: zeroDeletedCounts(),
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t
        .withIdentity(identity("reason-admin"))
        .mutation(api.systemAdminGroupDeletion.resumeGroupDeletion, {
          jobId,
          reason: "   ",
        }),
    ).rejects.toThrow("理由は1〜500文字で入力してください");
  });
});
