// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

async function seedFixture(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      userId: "admin",
      displayName: "Admin",
      email: "admin@example.test",
      createdAt: 1,
      updatedAt: 1,
    });
    const target = await ctx.db.insert("users", {
      userId: "target",
      displayName: "Target",
      email: "target@example.test",
      createdAt: 1,
      updatedAt: 1,
    });
    const groupA = await ctx.db.insert("groups", {
      name: "A",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const groupB = await ctx.db.insert("groups", {
      name: "B",
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
    await ctx.db.insert("groupMembers", {
      groupId: groupA,
      userId: "target",
      role: "member",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(target, { activeGroupId: groupA });
    return { admin, target, groupA, groupB };
  });
}

describe("system admin membership operations", () => {
  it.each(["add", "transfer", "set_active"] as const)(
    "管理者自身への%sは所属・activeGroupId・監査・通知を変更しない",
    async (operation) => {
      const t = convexTest(schema, convexTestModules);
      const fixture = await seedFixture(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("groupMembers", {
          groupId: fixture.groupA,
          userId: "admin",
          role: "member",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.patch(fixture.admin, { activeGroupId: fixture.groupA });
        if (operation === "set_active") {
          await ctx.db.insert("groupMembers", {
            groupId: fixture.groupB,
            userId: "admin",
            role: "member",
            createdAt: 1,
            updatedAt: 1,
          });
        }
      });
      const readState = () =>
        t.run(async (ctx) => ({
          user: await ctx.db.get(fixture.admin),
          memberships: await ctx.db.query("groupMembers").collect(),
          audits: await ctx.db.query("systemAdminAuditLogs").collect(),
          notifications: await ctx.db.query("systemAdminNotifications").collect(),
        }));
      const before = await readState();

      await expect(
        t
          .withIdentity(identity("admin"))
          .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
            targetUserId: fixture.admin,
            operation,
            sourceGroupId: operation === "transfer" ? fixture.groupA : undefined,
            targetGroupId: fixture.groupB,
            reason: "所属を整理",
          }),
      ).rejects.toThrow("自分自身の所属追加・移動・activeグループ設定はできません");

      expect(await readState()).toEqual(before);
    },
  );

  it.each(["remove", "clear_active"] as const)(
    "管理者自身への%sはactiveGroupIdを解除し、監査と通知を記録する",
    async (operation) => {
      const t = convexTest(schema, convexTestModules);
      const fixture = await seedFixture(t);
      const membershipId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("groupMembers", {
          groupId: fixture.groupA,
          userId: "admin",
          role: "member",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.patch(fixture.admin, { activeGroupId: fixture.groupA });
        return id;
      });

      await expect(
        t
          .withIdentity(identity("admin"))
          .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
            targetUserId: fixture.admin,
            operation,
            sourceGroupId: operation === "remove" ? fixture.groupA : undefined,
            reason: "所属を整理",
          }),
      ).resolves.toEqual({ operation, status: "success" });

      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(fixture.admin),
        membership: await ctx.db.get(membershipId),
        audits: await ctx.db.query("systemAdminAuditLogs").collect(),
        notifications: await ctx.db.query("systemAdminNotifications").collect(),
      }));
      expect(state.user?.activeGroupId).toBeUndefined();
      if (operation === "remove") expect(state.membership).toBeNull();
      else expect(state.membership?.role).toBe("member");
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        actorUserId: fixture.admin,
        targetUserId: fixture.admin,
        beforeActiveGroupId: fixture.groupA,
      });
      expect(state.audits[0].afterActiveGroupId).toBeUndefined();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].recipientUserId).toBe(fixture.admin);
    },
  );

  it("管理者自身がownerの場合も所属解除を拒否し、active選択だけ解除できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    const membershipId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("groupMembers", {
        groupId: fixture.groupA,
        userId: "admin",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(fixture.admin, { activeGroupId: fixture.groupA });
      return id;
    });
    const admin = t.withIdentity(identity("admin"));

    await expect(
      admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: fixture.admin,
        operation: "remove",
        sourceGroupId: fixture.groupA,
        reason: "所属を整理",
      }),
    ).rejects.toThrow("ownerの所属解除はこの操作ではできません");
    await admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
      targetUserId: fixture.admin,
      operation: "clear_active",
      reason: "選択を解除",
    });

    expect((await t.run((ctx) => ctx.db.get(membershipId)))?.role).toBe("owner");
    expect((await t.run((ctx) => ctx.db.get(fixture.admin)))?.activeGroupId).toBeUndefined();
  });

  it("他ユーザーの所属先をactiveグループに設定できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run((ctx) => ctx.db.patch(fixture.target, { activeGroupId: undefined }));

    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "set_active",
          targetGroupId: fixture.groupA,
          reason: "所属先を選択",
        }),
    ).resolves.toEqual({ operation: "set_active", status: "success" });
    expect((await t.run((ctx) => ctx.db.get(fixture.target)))?.activeGroupId).toBe(fixture.groupA);
  });

  it("transferは所属とactiveGroupIdを原子的にAからBへ移し、監査とoutboxを記録する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("groupMembers", {
        groupId: fixture.groupA,
        userId: "admin",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId: fixture.groupB,
        userId: "admin",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "transfer",
          sourceGroupId: fixture.groupA,
          targetGroupId: fixture.groupB,
          reason: "所属を整理",
        }),
    ).resolves.toMatchObject({ operation: "transfer", status: "success" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(fixture.target),
      memberships: await ctx.db
        .query("groupMembers")
        .withIndex("by_user_id", (q) => q.eq("userId", "target"))
        .collect(),
      audits: await ctx.db.query("systemAdminAuditLogs").collect(),
      notifications: await ctx.db.query("systemAdminNotifications").collect(),
    }));
    expect(state.user?.activeGroupId).toBe(fixture.groupB);
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({ groupId: fixture.groupB, role: "member" });
    expect(state.audits[0]).toMatchObject({
      action: "system_admin_membership_transferred",
      targetUserId: fixture.target,
      sourceGroupId: fixture.groupA,
      targetGroupId: fixture.groupB,
      beforeActiveGroupId: fixture.groupA,
      afterActiveGroupId: fixture.groupB,
      reason: "所属を整理",
      result: "success",
    });
    expect(state.notifications).toHaveLength(2);
    expect(
      new Set(state.notifications.map((notification) => notification.recipientUserId)),
    ).toEqual(new Set([fixture.target, fixture.admin]));
  });

  it("addはactiveGroupIdを自動変更せず、ownerのremove/transferと重複を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.target, { activeGroupId: undefined });
    });

    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "add",
          targetGroupId: fixture.groupB,
          reason: "追加",
        }),
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "add",
          targetGroupId: fixture.groupB,
          reason: "重複",
        }),
    ).rejects.toThrow();

    const user = await t.run((ctx) => ctx.db.get(fixture.target));
    expect(user?.activeGroupId).toBeUndefined();
  });

  it("set_activeは所属していないグループを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    const admin = t.withIdentity(identity("admin"));

    await expect(
      admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: fixture.target,
        operation: "set_active",
        targetGroupId: fixture.groupB,
        reason: "確認",
      }),
    ).rejects.toThrow("activeグループに指定する所属がありません");
  });

  it("set_activeは既にactiveの同じグループを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "set_active",
          targetGroupId: fixture.groupA,
          reason: "確認",
        }),
    ).rejects.toThrow("すでにactiveグループに設定されています");
  });

  it("clear_activeは解除後の再実行を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    const admin = t.withIdentity(identity("admin"));
    await admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
      targetUserId: fixture.target,
      operation: "clear_active",
      reason: "解除",
    });
    await expect(
      admin.mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: fixture.target,
        operation: "clear_active",
        reason: "重複",
      }),
    ).rejects.toThrow("activeグループは未選択です");
  });

  it("removeはactiveGroupIdだけを解除し、別のactiveGroupIdを勝手に選ばない", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("groupMembers", {
        groupId: fixture.groupB,
        userId: "target",
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(fixture.target, { activeGroupId: fixture.groupB });
    });
    await t
      .withIdentity(identity("admin"))
      .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: fixture.target,
        operation: "remove",
        sourceGroupId: fixture.groupA,
        reason: "解除",
      });
    expect((await t.run((ctx) => ctx.db.get(fixture.target)))?.activeGroupId).toBe(fixture.groupB);

    await t
      .withIdentity(identity("admin"))
      .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        targetUserId: fixture.target,
        operation: "remove",
        sourceGroupId: fixture.groupB,
        reason: "解除",
      });
    expect((await t.run((ctx) => ctx.db.get(fixture.target)))?.activeGroupId).toBeUndefined();
  });

  it("ownerのremoveを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_user_id", (q) =>
          q.eq("groupId", fixture.groupA).eq("userId", "target"),
        )
        .unique();
      await ctx.db.patch(membership!._id, { role: "owner" });
    });
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "remove",
          sourceGroupId: fixture.groupA,
          reason: "解除",
        }),
    ).rejects.toThrow("ownerの所属解除はこの操作ではできません");
  });

  it("ownerのtransferを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_user_id", (q) =>
          q.eq("groupId", fixture.groupA).eq("userId", "target"),
        )
        .unique();
      await ctx.db.patch(membership!._id, { role: "owner" });
    });
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "transfer",
          sourceGroupId: fixture.groupA,
          targetGroupId: fixture.groupB,
          reason: "移動",
        }),
    ).rejects.toThrow("ownerの付替えはこの操作ではできません");
  });

  it("deleting groupと理由不正を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.groupB, { status: "deleting" });
    });
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "add",
          targetGroupId: fixture.groupB,
          reason: "追加",
        }),
    ).rejects.toThrow("active状態のグループだけを指定できます");
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "add",
          targetGroupId: fixture.groupB,
          reason: " ",
        }),
    ).rejects.toThrow("理由は1〜500文字で入力してください");
  });

  it("account deletion中と未認証の操作を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      const user = await ctx.db.get(fixture.target);
      await ctx.db.insert("accountDeletionRequests", {
        userId: user!.userId,
        clerkUserId: "clerk-target",
        status: "requested",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t
        .withIdentity(identity("admin"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "add",
          targetGroupId: fixture.groupB,
          reason: "追加",
        }),
    ).rejects.toThrow("アカウント削除処理中のため、この操作はできません");
    await expect(
      t
        .withIdentity(identity("unknown"))
        .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
          targetUserId: fixture.target,
          operation: "clear_active",
          reason: "解除",
        }),
    ).rejects.toThrow("システム管理者権限が必要です");
  });
});
