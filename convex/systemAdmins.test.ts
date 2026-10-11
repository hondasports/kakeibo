// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

async function seedUsers(t: ReturnType<typeof convexTest>, ids: string[]) {
  return t.run(async (ctx) => {
    const result: Record<string, Id<"users">> = {};
    for (const userId of ids) {
      result[userId] = await ctx.db.insert("users", {
        userId,
        displayName: userId,
        email: `${userId}@example.test`,
        createdAt: 1,
        updatedAt: 1,
      });
    }
    return result;
  });
}

async function addAdmin(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  status: "active" | "revoked" = "active",
) {
  return t.run(async (ctx) =>
    ctx.db.insert("systemAdmins", {
      userId,
      status,
      createdAt: 1,
      updatedAt: 1,
      grantedAt: 1,
      grantReason: "初期管理者",
      ...(status === "revoked"
        ? { revokedAt: 2, revokedByUserId: userId, revokeReason: "テスト" }
        : {}),
    }),
  );
}

describe("system admin authorization lifecycle", () => {
  // APP_ENV 未設定は fail-closed のため、環境ラベルを明示して検証する
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未認証・未登録・revokedはcontextを返し、管理APIは拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["revoked"]);
    await addAdmin(t, users.revoked, "revoked");

    await expect(t.query(api.systemAdmins.getMySystemAdminContext, {})).resolves.toMatchObject({
      status: "none",
    });
    await expect(
      t.withIdentity(identity("unknown")).query(api.systemAdmins.listSystemAdmins, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(identity("revoked")).query(api.systemAdmins.listSystemAdmins, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(identity("revoked")).query(api.systemAdmins.getMySystemAdminContext, {}),
    ).resolves.toMatchObject({ status: "revoked" });
  });

  it("bootstrapはserver-onlyで初回だけ作成し、監査と通知を残す", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["first"]);
    const original = process.env.APP_ENV;
    process.env.APP_ENV = "development";
    try {
      await expect(
        t.mutation(internal.systemAdmins.bootstrapSystemAdmin, {
          targetUserId: users.first,
          reason: "運用担当者を登録",
          expectedEnvironment: "development",
        }),
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        t.mutation(internal.systemAdmins.bootstrapSystemAdmin, {
          targetUserId: users.first,
          reason: "重複",
          expectedEnvironment: "development",
        }),
      ).rejects.toThrow();
    } finally {
      process.env.APP_ENV = original;
    }
    const state = await t.run(async (ctx) => ({
      admins: await ctx.db.query("systemAdmins").collect(),
      audits: await ctx.db.query("systemAdminAuditLogs").collect(),
      notifications: await ctx.db.query("systemAdminNotifications").collect(),
    }));
    expect(state.admins).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "system_admin_bootstrapped",
      actorType: "system",
      targetDisplayNameSnapshot: "first",
      reason: "運用担当者を登録",
    });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.payloadJson).not.toContain("運用担当者");
  });

  it("grant/regrant、通知dedupe、監査paginationを提供する", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["owner", "target"]);
    await addAdmin(t, users.owner);
    const owner = t.withIdentity(identity("owner"));

    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: users.target,
        reason: "運用を委任",
      }),
    ).resolves.toMatchObject({ status: "active", regranted: false });
    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: users.target,
        reason: "二重付与",
      }),
    ).rejects.toThrow();

    await owner.mutation(api.systemAdmins.revokeSystemAdmin, {
      targetUserId: users.target,
      reason: "一時停止",
    });
    await owner.mutation(api.systemAdmins.grantSystemAdmin, {
      targetUserId: users.target,
      reason: "復帰",
    });
    const page = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page.page).toHaveLength(2);
    expect(page.continueCursor).toBeTruthy();
    const state = await t.run(async (ctx) => ({
      admins: await ctx.db.query("systemAdmins").collect(),
      notifications: await ctx.db.query("systemAdminNotifications").collect(),
    }));
    expect(state.admins.find((admin) => admin.userId === users.target)?.status).toBe("active");
    expect(new Set(state.notifications.map((notification) => notification.dedupeKey)).size).toBe(
      state.notifications.length,
    );
    expect(state.notifications.length).toBeGreaterThanOrEqual(4);
  });

  it("管理者一覧はactiveを初期表示し、対象ユーザーの表示情報を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["owner", "target", "other", "revoked"]);
    await addAdmin(t, users.owner);
    await addAdmin(t, users.other);
    await addAdmin(t, users.revoked, "revoked");
    const owner = t.withIdentity(identity("owner"));

    const defaultPage = await owner.query(api.systemAdmins.listSystemAdmins, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(defaultPage.page).toHaveLength(2);
    expect(defaultPage.hasAnotherActiveAdmin).toBe(true);
    expect(defaultPage.page.find((item) => item.targetUserId === users.owner)).toMatchObject({
      status: "active",
      targetUserId: users.owner,
      email: "owner@example.test",
      isSelf: true,
    });
    expect(defaultPage.page.find((item) => item.targetUserId === users.other)).toMatchObject({
      status: "active",
      isSelf: false,
    });

    const revokedPage = await owner.query(api.systemAdmins.listSystemAdmins, {
      paginationOpts: { numItems: 10, cursor: null },
      status: "revoked",
    });
    expect(revokedPage.page).toHaveLength(1);
    expect(revokedPage.page[0]).toMatchObject({ status: "revoked", targetUserId: users.revoked });
  });

  it("監査ログは期間・action・actor・targetをserver-sideで絞り込む", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["owner", "target", "other"]);
    await addAdmin(t, users.owner);
    await addAdmin(t, users.other);
    const owner = t.withIdentity(identity("owner"));
    const other = t.withIdentity(identity("other"));

    await owner.mutation(api.systemAdmins.grantSystemAdmin, {
      targetUserId: users.target,
      reason: "委任",
    });
    await other.mutation(api.systemAdmins.revokeSystemAdmin, {
      targetUserId: users.target,
      reason: "停止",
    });

    const all = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const grant = all.page.find((log) => log.action === "system_admin_granted");
    const revoke = all.page.find((log) => log.action === "system_admin_revoked");
    expect(grant).toBeDefined();
    expect(revoke).toBeDefined();
    expect(grant).toMatchObject({
      result: "success",
      actorUserId: users.owner,
      targetUserId: users.target,
    });

    await expect(
      owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
        paginationOpts: { numItems: 10, cursor: null },
        action: "system_admin_granted",
        actorUserId: users.owner,
        targetUserId: users.target,
        from: grant?.createdAt,
        to: grant?.createdAt,
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ action: "system_admin_granted" })],
    });
    const actionOnly = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      action: "system_admin_granted",
    });
    expect(actionOnly.page.every((log) => log.action === "system_admin_granted")).toBe(true);
    const actorOnly = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      actorUserId: users.owner,
    });
    expect(actorOnly.page.every((log) => log.actorUserId === users.owner)).toBe(true);
    const targetOnly = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      targetUserId: users.target,
    });
    expect(targetOnly.page.every((log) => log.targetUserId === users.target)).toBe(true);
    const actionActor = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      action: "system_admin_granted",
      actorUserId: users.owner,
    });
    expect(actionActor.page).toHaveLength(1);
    const actionTarget = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      action: "system_admin_granted",
      targetUserId: users.target,
    });
    expect(actionTarget.page).toHaveLength(1);
    const actorTarget = await owner.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      actorUserId: users.other,
      targetUserId: users.target,
    });
    expect(actorTarget.page).toHaveLength(1);
    expect(actorTarget.page[0]).toMatchObject({ action: "system_admin_revoked" });
  });

  it("自己操作・最後のadmin剥奪・理由不備・存在しない対象を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["owner", "other"]);
    await addAdmin(t, users.owner);
    const owner = t.withIdentity(identity("owner"));

    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: users.owner,
        reason: "自己付与",
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.systemAdmins.revokeSystemAdmin, {
        targetUserId: users.owner,
        reason: "自己剥奪",
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: users.other,
        reason: " ",
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: users.other,
        reason: "x".repeat(501),
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.systemAdmins.revokeSystemAdmin, {
        targetUserId: users.other,
        reason: "対象外",
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.systemAdmins.grantSystemAdmin, {
        targetUserId: "missing" as Id<"users">,
        reason: "対象外",
      }),
    ).rejects.toThrow();
  });

  it("最後のadminは剥奪できず、recoverはactive admin不在時だけ使える", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["owner", "other"]);
    await addAdmin(t, users.owner);
    const owner = t.withIdentity(identity("owner"));
    await expect(
      owner.mutation(api.systemAdmins.revokeSystemAdmin, {
        targetUserId: users.other,
        reason: "対象外",
      }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", users.owner))
        .unique();
      if (admin)
        await ctx.db.patch(admin._id, {
          status: "revoked",
          revokedAt: 2,
          revokedByUserId: users.owner,
          revokeReason: "復旧テスト",
        });
    });
    const original = process.env.APP_ENV;
    process.env.APP_ENV = "development";
    try {
      await expect(
        t.mutation(internal.systemAdmins.recoverSystemAdmin, {
          targetUserId: users.other,
          reason: "緊急復旧",
          expectedEnvironment: "development",
        }),
      ).resolves.toMatchObject({ status: "active" });
    } finally {
      process.env.APP_ENV = original;
    }
  });

  it("bootstrap/recoverはAPP_ENV不一致を変更前に拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const users = await seedUsers(t, ["first"]);
    const original = process.env.APP_ENV;
    process.env.APP_ENV = "development";
    try {
      await expect(
        t.mutation(internal.systemAdmins.bootstrapSystemAdmin, {
          targetUserId: users.first,
          reason: "環境不一致",
          expectedEnvironment: "production",
        }),
      ).rejects.toThrow();
    } finally {
      process.env.APP_ENV = original;
    }
    await expect(
      t.run(async (ctx) => ctx.db.query("systemAdmins").collect()),
    ).resolves.toHaveLength(0);
  });
});
