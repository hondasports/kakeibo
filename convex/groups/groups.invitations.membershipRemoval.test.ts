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
