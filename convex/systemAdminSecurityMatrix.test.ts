// @vitest-environment edge-runtime
/// <reference types="vite/client" />

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

describe("system admin security matrix", () => {
  // APP_ENV 未設定は fail-closed のため、環境ラベルを明示して検証する
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("管理者本人の所属追加を拒否し、家計集計は通常の所属グループに限定する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", {
        userId: "admin",
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
      const groups = [];
      for (const [name, amount] of [
        ["所属先", 100],
        ["別グループ", 200],
      ] as const) {
        const groupId = await ctx.db.insert("groups", {
          name,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const categoryId = await ctx.db.insert("categories", {
          groupId,
          name: "食費",
          color: "#000000",
          isActive: true,
          sortOrder: 0,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("expenseEntries", {
          groupId,
          categoryId,
          date: "2026-10-19",
          amount,
          title: "支出",
          entryType: "expense",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
        });
        groups.push(groupId);
      }
      return { admin, ownGroup: groups[0], otherGroup: groups[1] };
    });
    const admin = t.withIdentity(identity("admin"));
    const summaryArgs = { weekStartDate: "2026-10-19" };
    await expect(admin.query(api.receipts.summaries.getWeekSummary, summaryArgs)).rejects.toThrow(
      "グループに所属していません",
    );
    await expect(
      admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: ids.admin,
        operation: "add",
        targetGroupId: ids.otherGroup,
        reason: "所属を整理",
      }),
    ).rejects.toThrow("自分自身の所属追加・移動・activeグループ設定はできません");
    await expect(admin.query(api.receipts.summaries.getWeekSummary, summaryArgs)).rejects.toThrow(
      "グループに所属していません",
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("groupMembers", {
        groupId: ids.ownGroup,
        userId: "admin",
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ids.admin, { activeGroupId: ids.ownGroup });
    });
    await expect(
      admin.query(api.receipts.summaries.getWeekSummary, summaryArgs),
    ).resolves.toMatchObject({
      count: 1,
      totalAmountYen: 100,
    });
  });

  it("管理APIのレスポンスと監査allowlistに家計データ・tokenを含めない", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", {
        userId: "admin",
        displayName: "管理者",
        createdAt: 1,
        updatedAt: 1,
      });
      const group = await ctx.db.insert("groups", {
        name: "安全確認group",
        status: "active",
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
      await ctx.db.insert("groupInvitations", {
        groupId: group,
        email: "invitee@example.test",
        token: "secret-token-value",
        clerkInvitationId: "secret-clerk-invitation",
        status: "pending",
        invitedByUserId: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("expenseEntries", {
        groupId: group,
        date: "2026-07-18",
        amount: 987654,
        title: "家計の秘密支出",
        memo: "家計memo-secret",
        entryType: "expense",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      });
      return { group };
    });

    const admin = t.withIdentity(identity("admin"));
    const detail = await admin.action(api.systemAdminSearch.getGroupDetail, {
      groupId: ids.group,
    });
    expect(detail).toMatchObject({ name: "安全確認group" });
    const serialized = JSON.stringify(detail);
    for (const forbidden of [
      "secret-token-value",
      "secret-clerk-invitation",
      "987654",
      "家計memo-secret",
      "expenseEntries",
      "amount",
      "memo",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(detail?.invitations[0] ?? {}).sort()).toEqual(
      ["createdAt", "email", "id", "status", "updatedAt"].sort(),
    );

    const logs = await admin.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(logs.page[0]).toMatchObject({ action: "system_admin_group_viewed" });
    expect(JSON.stringify(logs)).not.toContain("家計memo-secret");
    expect(JSON.stringify(logs)).not.toContain("secret-token-value");
  });
});
