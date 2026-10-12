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
