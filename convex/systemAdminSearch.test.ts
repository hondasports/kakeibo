// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      userId: "admin",
      displayName: "管理者",
      email: "admin@example.test",
      createdAt: 1,
      updatedAt: 1,
    });
    const targetId = await ctx.db.insert("users", {
      userId: "target-user",
      displayName: "対象ユーザー",
      email: "target@example.test",
      createdAt: 1,
      updatedAt: 1,
    });
    const secondTargetId = await ctx.db.insert("users", {
      userId: "target-user-2",
      displayName: "対象ユーザー2",
      email: "target2@example.test",
      createdAt: 1,
      updatedAt: 1,
    });
    const groupId = await ctx.db.insert("groups", {
      name: "対象グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const secondGroupId = await ctx.db.insert("groups", {
      name: "対象グループ2",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("systemAdmins", {
      userId: adminId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      grantedAt: 1,
      grantReason: "テスト",
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: "target-user",
      role: "member",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupInvitations", {
      groupId,
      email: "target@example.test",
      token: "do-not-return",
      clerkInvitationId: "clerk-invitation-secret",
      status: "pending",
      invitedByUserId: "admin",
      createdAt: 1,
      updatedAt: 1,
    });
    return { adminId, targetId, secondTargetId, groupId, secondGroupId };
  });
}

describe("system admin search and detail API", () => {
  // APP_ENV 未設定は fail-closed のため、環境ラベルを明示して検証する
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("APP_ENVが未設定・不正なら検索を拒否する（developmentへフォールバックしない）", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const admin = t.withIdentity(identity("admin"));
    for (const appEnv of ["", "prod", "Production"]) {
      vi.stubEnv("APP_ENV", appEnv);
      await expect(
        admin.action(api.systemAdminSearch.searchUsers, {
          queryType: "email",
          query: "   ",
          paginationOpts: { numItems: 1, cursor: null },
        }),
      ).rejects.toThrow("APP_ENVが正しく設定されていません");
    }
  });

  it("空白だけのユーザー検索を条件なし一覧として実行する", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "newest-user",
        displayName: "最新ユーザー",
        email: "newest@example.test",
        createdAt: 5,
        updatedAt: 5,
      });
    });
    const admin = t.withIdentity(identity("admin"));

    const users = await admin.action(api.systemAdminSearch.searchUsers, {
      queryType: "email",
      query: "   ",
      paginationOpts: { numItems: 1, cursor: null },
    });

    expect(users.page).toHaveLength(1);
    expect(users.page[0]).toMatchObject({ userId: "newest-user" });
    expect(users.isDone).toBe(false);
    const audits = await t.run(async (ctx) =>
      ctx.db.query("systemAdminAuditLogs").withIndex("by_created_at").order("desc").take(1),
    );
    expect(audits[0]).toMatchObject({
      action: "system_admin_user_searched",
      queryType: "user_email",
      resultCount: 1,
    });
    expect(audits[0]?.queryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("空のグループ検索は全状態を新しい順にページングする", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("groups", {
        name: "削除中グループ",
        status: "deleting",
        createdAt: 4,
        updatedAt: 4,
      });
      await ctx.db.insert("groups", {
        name: "削除済みグループ",
        status: "deleted",
        createdAt: 5,
        updatedAt: 5,
      });
      await ctx.db.insert("groups", {
        name: "アーカイブ済みグループ",
        status: "archived",
        createdAt: 6,
        updatedAt: 6,
      });
    });
    const admin = t.withIdentity(identity("admin"));

    const firstPage = await admin.action(api.systemAdminSearch.searchGroups, {
      queryType: "groupId",
      query: "",
      paginationOpts: { numItems: 1, cursor: null },
    });
    const secondPage = await admin.action(api.systemAdminSearch.searchGroups, {
      queryType: "groupId",
      query: "",
      paginationOpts: { numItems: 10, cursor: firstPage.continueCursor },
    });

    expect(firstPage.page[0]).toMatchObject({ name: "アーカイブ済みグループ", status: "archived" });
    expect(secondPage.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "削除済みグループ", status: "deleted" }),
        expect.objectContaining({ name: "削除中グループ", status: "deleting" }),
        expect.objectContaining({ name: "対象グループ", status: "active" }),
      ]),
    );
  });

  it("ユーザー・グループ検索をページングし、管理情報だけを返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const admin = t.withIdentity(identity("admin"));

    const users = await admin.action(api.systemAdminSearch.searchUsers, {
      queryType: "displayName",
      query: "対象",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(users.page).toHaveLength(1);
    expect(users.page[0]).toMatchObject({
      displayName: "対象ユーザー",
      email: "target@example.test",
    });
    expect(users.page[0]).not.toHaveProperty("monthlyIncome");
    const usersSecondPage = await admin.action(api.systemAdminSearch.searchUsers, {
      queryType: "displayName",
      query: "対象",
      paginationOpts: { numItems: 1, cursor: users.continueCursor },
    });
    expect(new Set([...users.page, ...usersSecondPage.page].map((user) => user.userId))).toEqual(
      new Set(["target-user", "target-user-2"]),
    );

    const groups = await admin.action(api.systemAdminSearch.searchGroups, {
      queryType: "name",
      query: "対象",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(groups.page).toHaveLength(1);
    expect(groups.page[0]).toMatchObject({ name: "対象グループ", status: "active" });
    expect(groups.page[0]).not.toHaveProperty("expenseEntries");
    const groupsSecondPage = await admin.action(api.systemAdminSearch.searchGroups, {
      queryType: "name",
      query: "対象",
      paginationOpts: { numItems: 1, cursor: groups.continueCursor },
    });
    expect(new Set([...groups.page, ...groupsSecondPage.page].map((group) => group.name))).toEqual(
      new Set(["対象グループ", "対象グループ2"]),
    );
  });

  it("ユーザー・グループ詳細は所属と招待のsnapshotだけを返し、tokenを返さない", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity("admin"));

    const user = await admin.action(api.systemAdminSearch.getUserDetail, { userId: ids.targetId });
    expect(user).toMatchObject({
      displayName: "対象ユーザー",
      memberships: [{ role: "member" }],
      invitations: [{ groupName: "対象グループ", status: "pending" }],
    });
    expect(JSON.stringify(user)).not.toContain("do-not-return");
    expect(JSON.stringify(user)).not.toContain("clerk-invitation-secret");
    expect(JSON.stringify(user)).not.toContain("monthlyIncome");

    const group = await admin.action(api.systemAdminSearch.getGroupDetail, {
      groupId: ids.groupId,
    });
    expect(group).toMatchObject({
      name: "対象グループ",
      members: [{ role: "member" }],
      invitations: [{ email: "target@example.test", status: "pending" }],
    });
    expect(JSON.stringify(group)).not.toContain("do-not-return");
    expect(JSON.stringify(group)).not.toContain("clerk-invitation-secret");
  });

  it("非管理者・revoked管理者は検索と詳細を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const memberId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        userId: "member",
        displayName: "一般ユーザー",
        email: "member@example.test",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(
      t.withIdentity(identity("member")).action(api.systemAdminSearch.searchUsers, {
        queryType: "userId",
        query: "target-user",
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", ids.adminId))
        .unique();
      if (admin)
        await ctx.db.patch(admin._id, {
          status: "revoked",
          revokedAt: 2,
          revokedByUserId: ids.adminId,
          revokeReason: "テスト",
        });
    });
    await expect(
      t
        .withIdentity(identity("admin"))
        .action(api.systemAdminSearch.getGroupDetail, { groupId: ids.groupId }),
    ).rejects.toThrow();
    expect(memberId).toBeDefined();
  });

  it("検索語を監査へ平文保存せず、詳細閲覧を監査する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity("admin"));
    await admin.action(api.systemAdminSearch.searchUsers, {
      queryType: "email",
      query: "target@example.test",
      paginationOpts: { numItems: 10, cursor: null },
    });
    await admin.action(api.systemAdminSearch.getGroupDetail, { groupId: ids.groupId });
    const audits = await t.run(async (ctx) => ctx.db.query("systemAdminAuditLogs").collect());
    expect(audits.map((audit) => audit.action)).toEqual([
      "system_admin_user_searched",
      "system_admin_group_viewed",
    ]);
    expect(JSON.stringify(audits)).not.toContain("target@example.test");
    const auditLogPage = await admin.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const searchedAudit = auditLogPage.page.find(
      (audit) => audit.action === "system_admin_user_searched",
    );
    const viewedAudit = auditLogPage.page.find(
      (audit) => audit.action === "system_admin_group_viewed",
    );
    expect(searchedAudit?.queryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(searchedAudit?.resultCount).toBe(1);
    expect(viewedAudit).toMatchObject({ targetId: ids.groupId, resultCount: 1 });
  });

  it("長すぎる検索語・ページ件数の境界値を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const admin = t.withIdentity(identity("admin"));
    await expect(
      admin.action(api.systemAdminSearch.searchUsers, {
        queryType: "displayName",
        query: "a".repeat(201),
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
    await expect(
      admin.action(api.systemAdminSearch.searchGroups, {
        queryType: "name",
        query: "対象",
        paginationOpts: { numItems: 101, cursor: null },
      }),
    ).rejects.toThrow();
  });
});
