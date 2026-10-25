// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const ownerId = "https://issuer.example|owner";
const memberId = "https://issuer.example|member";

async function setup(profileEmail: string | undefined = "primary@example.test") {
  const t = convexTest(schema, convexTestModules);
  const groupId = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "家計",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (const [userId, role] of [
      [ownerId, "owner"],
      [memberId, "member"],
    ] as const) {
      await ctx.db.insert("users", {
        userId,
        displayName: role,
        activeGroupId: groupId,
        ...(userId === memberId && profileEmail ? { email: profileEmail } : {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return groupId;
  });
  const invite = async (token: string, email = "secondary@example.test") =>
    t.mutation(internal.groups.invitations.createGroupInvitationRecord, {
      groupId,
      email,
      token,
      invitedByUserId: ownerId,
    });
  const remove = () =>
    t
      .withIdentity({ tokenIdentifier: ownerId })
      .mutation(api.groups.members.removeMember, { targetUserId: memberId });
  const accept = (token: string, acceptedUserId = memberId) =>
    t.mutation(internal.groups.invitations.acceptGroupInvitationForVerifiedEmails, {
      token,
      acceptedUserId,
      acceptedEmails: ["primary@example.test", "secondary@example.test"],
    });
  const membership = () =>
    t.run((ctx) =>
      ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_user_id", (q) =>
          q.eq("groupId", groupId).eq("userId", memberId),
        )
        .unique(),
    );
  return { t, groupId, invite, remove, accept, membership };
}

afterEach(() => vi.useRealTimers());

async function setupSystemAdminRemoval() {
  const fixture = await setup();
  const { targetGroupId, memberDocId } = await fixture.t.run(async (ctx) => {
    const adminDocId = await ctx.db.insert("users", {
      userId: "system-admin",
      displayName: "管理者",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("systemAdmins", {
      userId: adminDocId,
      status: "active",
      grantedAt: 1,
      grantReason: "管理",
      createdAt: 1,
      updatedAt: 1,
    });
    const targetGroupId = await ctx.db.insert("groups", {
      name: "移動先",
      createdAt: 1,
      updatedAt: 1,
    });
    const member = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) => q.eq("userId", memberId))
      .unique();
    return { targetGroupId, memberDocId: member!._id };
  });
  const operate = (
    operation: "remove" | "transfer",
    sourceGroupId = fixture.groupId,
    targetUserId = memberDocId,
  ) =>
    fixture.t
      .withIdentity({ tokenIdentifier: "system-admin" })
      .mutation(api.systemAdminMembership.systemAdminMembershipOperation, {
        operation,
        sourceGroupId,
        targetUserId,
        reason: "所属を整理",
        ...(operation === "transfer" ? { targetGroupId } : {}),
      });
  return { ...fixture, targetGroupId, memberDocId, operate };
}

describe("管理者による所属解除と招待の発行順", () => {
  it.each(["remove", "transfer"] as const)(
    "%s 後は解除前の招待を拒否し、同じミリ秒の再招待は受け入れる",
    async (operation) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { t, groupId, invite, operate, accept, membership, memberDocId, targetGroupId } =
        await setupSystemAdminRemoval();
      await invite("before-admin-removal");
      await operate(operation);
      const state = await t.run(async (ctx) => ({
        audit: await ctx.db.query("systemAdminAuditLogs").first(),
      }));
      expect(state.audit).toMatchObject({
        action:
          operation === "remove"
            ? "system_admin_membership_removed"
            : "system_admin_membership_transferred",
        targetUserId: memberDocId,
        sourceGroupId: groupId,
        result: "success",
      });
      await expect(accept("before-admin-removal")).rejects.toThrow("新しい招待を依頼してください");
      expect(await membership()).toBeNull();
      expect((await t.run((ctx) => ctx.db.get(memberDocId)))?.activeGroupId).toBe(
        operation === "transfer" ? targetGroupId : undefined,
      );
      await invite("after-admin-removal");
      await expect(accept("after-admin-removal")).resolves.toEqual(groupId);
      expect(await membership()).toMatchObject({ role: "member" });
    },
  );

  it.each(["remove", "transfer"] as const)(
    "%s の後に再参加してから再度解除した場合は最後の解除を適用する",
    async (operation) => {
      const { invite, operate, accept, membership } = await setupSystemAdminRemoval();
      await operate(operation);
      await invite("first-rejoin", "primary@example.test");
      await accept("first-rejoin");
      await invite("before-latest-removal");
      await operate("remove");
      await expect(accept("before-latest-removal")).rejects.toThrow("新しい招待を依頼してください");
      expect(await membership()).toBeNull();
    },
  );

  it("別ユーザーの管理者による所属解除は招待の受諾に影響しない", async () => {
    const { t, groupId, invite, operate, accept } = await setupSystemAdminRemoval();
    await invite("other-user");
    const otherDocId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        userId: "other-member",
        displayName: "別メンバー",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "other-member",
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
      return id;
    });
    await operate("remove", groupId, otherDocId);
    await expect(accept("other-user")).resolves.toEqual(groupId);
  });

  it("別グループの管理者による所属解除は招待の受諾に影響しない", async () => {
    const { t, groupId, targetGroupId, invite, operate, accept } = await setupSystemAdminRemoval();
    await invite("other-group");
    await t.run((ctx) =>
      ctx.db.insert("groupMembers", {
        groupId: targetGroupId,
        userId: memberId,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await operate("remove", targetGroupId);
    await expect(accept("other-group")).resolves.toEqual(groupId);
  });

  it("移動先グループの招待は移動前の発行でも受け入れる", async () => {
    const { t, targetGroupId, operate, accept } = await setupSystemAdminRemoval();
    await t.mutation(internal.groups.invitations.createGroupInvitationRecord, {
      groupId: targetGroupId,
      email: "secondary@example.test",
      token: "destination-invitation",
      invitedByUserId: ownerId,
    });
    await operate("transfer");
    await expect(accept("destination-invitation")).resolves.toEqual(targetGroupId);
  });

  it.each([
    { action: "system_admin_membership_removed", result: "denied" },
    { action: "system_admin_active_group_cleared", result: "success" },
  ] as const)("$action の $result 記録は所属解除として扱わない", async ({ action, result }) => {
    const { t, groupId, memberDocId, invite, accept } = await setupSystemAdminRemoval();
    await invite("unchanged-membership");
    await t.run((ctx) =>
      ctx.db.insert("systemAdminAuditLogs", {
        action,
        actorType: "system_admin",
        targetKind: "user",
        targetUserId: memberDocId,
        sourceGroupId: groupId,
        result,
        createdAt: Date.now(),
      }),
    );
    await expect(accept("unchanged-membership")).resolves.toEqual(groupId);
  });
});

describe("メンバー解除と招待の発行順", () => {
  it.each([
    { label: "プロフィールメールあり", profileEmail: "primary@example.test" },
    { label: "プロフィールメールなし", profileEmail: "" },
  ])("$label でも解除前の別メール招待で再参加しない", async ({ profileEmail }) => {
    const { invite, remove, accept, membership, t } = await setup(profileEmail);
    await invite("before-removal");
    await remove();
    await expect(accept("before-removal")).rejects.toThrow("新しい招待を依頼してください");
    expect(await membership()).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("groupInvitations")
          .withIndex("by_token", (q) => q.eq("token", "before-removal"))
          .unique(),
      ),
    ).toMatchObject({ status: "pending" });
  });

  it("同じミリ秒でも解除後に発行した再招待は受け入れる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { invite, remove, accept, membership, groupId } = await setup();
    await invite("before-removal");
    await remove();
    await expect(accept("before-removal")).rejects.toThrow("新しい招待を依頼してください");
    await invite("after-removal");
    await expect(accept("after-removal")).resolves.toEqual(groupId);
    expect(await membership()).toMatchObject({ role: "member" });
  });

  it("複数回の解除では最後の解除より前の招待を受け入れない", async () => {
    const { invite, remove, accept, membership } = await setup();
    await remove();
    await invite("rejoin", "primary@example.test");
    await accept("rejoin");
    await invite("before-second-removal");
    await remove();
    await expect(accept("before-second-removal")).rejects.toThrow("新しい招待を依頼してください");
    expect(await membership()).toBeNull();
  });

  it("別ユーザーの解除記録は招待の受け入れに影響しない", async () => {
    const { invite, remove, accept, groupId } = await setup();
    await invite("another-member");
    await remove();
    await expect(accept("another-member", "https://issuer.example|another")).resolves.toEqual(
      groupId,
    );
  });

  it("別グループの解除記録は招待の受け入れに影響しない", async () => {
    const { t, invite, accept, groupId } = await setup();
    await invite("other-group");
    await t.run(async (ctx) => {
      const otherGroupId = await ctx.db.insert("groups", {
        name: "別家計",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("managementAuditLogs", {
        groupId: otherGroupId,
        actorUserId: ownerId,
        action: "member_removed",
        targetKind: "member",
        targetId: memberId,
        createdAt: Date.now(),
      });
    });
    await expect(accept("other-group")).resolves.toEqual(groupId);
  });
});
