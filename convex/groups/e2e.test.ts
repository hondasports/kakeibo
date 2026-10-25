// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

afterEach(() => vi.unstubAllEnvs());

async function fixture(userId = "e2e-seed|existing", includeOtherGroup = true) {
  const t = convexTest(schema, convexTestModules);
  const ids = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "対象", createdAt: 1, updatedAt: 1 });
    const otherGroupId = await ctx.db.insert("groups", {
      name: "別グループ",
      createdAt: 1,
      updatedAt: 1,
    });
    const userRecordId = await ctx.db.insert("users", {
      userId,
      email: "seed@example.test",
      displayName: "既存",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const successorId = await ctx.db.insert("groupMembers", {
      groupId,
      userId: "remaining",
      role: "member",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherMembershipId = includeOtherGroup
      ? await ctx.db.insert("groupMembers", {
          groupId: otherGroupId,
          userId,
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        })
      : null;
    const otherMemberId = await ctx.db.insert("groupMembers", {
      groupId: otherGroupId,
      userId: "other-remaining",
      role: "member",
      createdAt: 1,
      updatedAt: 1,
    });
    return {
      groupId,
      otherGroupId,
      userRecordId,
      membershipId,
      successorId,
      otherMembershipId,
      otherMemberId,
    };
  });
  return { t, ids, userId };
}

describe("E2E メンバーの所属範囲", () => {
  it("HTTP の所属 cleanup と role 変更を併用しても別グループを保つ", async () => {
    const { t, ids, userId } = await fixture("clerk|configured");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("E2E_CLERK_USER_ID", userId);
    vi.stubEnv("E2E_CLEANUP_SECRET", "test-secret");
    const response = await t.fetch("/e2e/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": "test-secret" },
      body: JSON.stringify({ userId, clearGroupMemberships: true, setGroupMemberRole: "member" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      groupMemberships: { deletedCount: 1 },
      groupMemberRole: { updated: false },
    });
    expect(await t.run(async (ctx) => ctx.db.get(ids.membershipId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(ids.otherMembershipId!))).toMatchObject({
      role: "owner",
    });
  });

  it.each([true, false])(
    "別グループにも所属する seed の置き換えは状態を保って拒否する（対象所属: %s）",
    async (keepTarget) => {
      const { t, ids } = await fixture();
      if (!keepTarget)
        await t.run(async (ctx) => {
          await ctx.db.delete(ids.membershipId);
        });
      const before = await t.run(async (ctx) => ({
        users: await ctx.db.query("users").collect(),
        members: await ctx.db.query("groupMembers").collect(),
      }));
      await expect(
        t.mutation(internal.groups.e2e.seedGroupMemberForE2e, {
          groupId: ids.groupId,
          displayName: "新メンバー",
          email: " SEED@EXAMPLE.TEST ",
        }),
      ).rejects.toThrow("別のグループに所属する E2E ユーザーは置き換えできません");
      expect(
        await t.run(async (ctx) => ({
          users: await ctx.db.query("users").collect(),
          members: await ctx.db.query("groupMembers").collect(),
        })),
      ).toEqual(before);
    },
  );

  it("対象グループだけに所属する seed は置き換えて owner を引き継ぐ", async () => {
    const { t, ids, userId } = await fixture(undefined, false);
    const result = await t.mutation(internal.groups.e2e.seedGroupMemberForE2e, {
      groupId: ids.groupId,
      displayName: "新メンバー",
      email: "seed@example.test",
    });
    expect(result.memberUserId).not.toBe(userId);
    const state = await t.run(async (ctx) => ({
      oldUser: await ctx.db.get(ids.userRecordId),
      oldMember: await ctx.db.get(ids.membershipId),
      successor: await ctx.db.get(ids.successorId),
      members: await ctx.db
        .query("groupMembers")
        .withIndex("by_user_id", (q) => q.eq("userId", result.memberUserId))
        .collect(),
    }));
    expect(state.oldUser).toBeNull();
    expect(state.oldMember).toBeNull();
    expect(state.successor?.role).toBe("owner");
    expect(state.members).toMatchObject([{ groupId: ids.groupId, role: "member" }]);
  });

  it.each(["e2e-seed|existing", "clerk|configured"])(
    "所属 cleanup は対象グループだけを削除して他の所属とユーザーを残す（%s）",
    async (userId) => {
      const { t, ids } = await fixture(userId);
      await expect(
        t.mutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
          userId,
          groupId: ids.groupId,
        }),
      ).resolves.toEqual({ deletedCount: 1 });
      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(ids.userRecordId),
        member: await ctx.db.get(ids.membershipId),
        successor: await ctx.db.get(ids.successorId),
        other: await ctx.db.get(ids.otherMembershipId!),
        otherMember: await ctx.db.get(ids.otherMemberId),
      }));
      expect(state.member).toBeNull();
      expect(state.user?.activeGroupId).toBe(ids.otherGroupId);
      expect(state.successor?.role).toBe("owner");
      expect(state.other).toMatchObject({ groupId: ids.otherGroupId, userId, role: "owner" });
      expect(state.otherMember?.role).toBe("member");
    },
  );

  it("対象グループがない cleanup は既存の所属とユーザーを保つ", async () => {
    const { t, ids, userId } = await fixture();
    await expect(
      t.mutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
        userId,
        groupId: null,
      }),
    ).resolves.toEqual({ deletedCount: 0 });
    expect(await t.run(async (ctx) => ctx.db.get(ids.userRecordId))).toMatchObject({
      activeGroupId: ids.groupId,
    });
    expect(await t.run(async (ctx) => ctx.db.get(ids.membershipId))).not.toBeNull();
  });

  it.each(["e2e-seed|existing", "clerk|configured"])(
    "最後の所属の cleanup は seed だけユーザーを削除する（%s）",
    async (userId) => {
      const { t, ids } = await fixture(userId, false);
      await expect(
        t.mutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
          userId,
          groupId: ids.groupId,
        }),
      ).resolves.toEqual({ deletedCount: 1 });
      const user = await t.run(async (ctx) => ctx.db.get(ids.userRecordId));
      if (userId.startsWith("e2e-seed|")) expect(user).toBeNull();
      else {
        expect(user?.userId).toBe(userId);
        expect(user?.activeGroupId).toBeUndefined();
      }
    },
  );

  it("所属 cleanup 後の role 変更は別グループの所属を変更しない", async () => {
    const { t, ids, userId } = await fixture("clerk|configured");
    await t.mutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
      userId,
      groupId: ids.groupId,
    });
    await expect(
      t.mutation(internal.groups.e2e.setGroupMemberRoleForE2e, {
        userId,
        groupId: ids.groupId,
        role: "member",
      }),
    ).resolves.toEqual({ updated: false });
    expect(await t.run(async (ctx) => ctx.db.get(ids.otherMembershipId!))).toMatchObject({
      role: "owner",
    });
  });

  it("role 変更は指定グループの所属だけに適用する", async () => {
    const { t, ids, userId } = await fixture("clerk|configured");
    await expect(
      t.mutation(internal.groups.e2e.setGroupMemberRoleForE2e, {
        userId,
        groupId: ids.groupId,
        role: "member",
      }),
    ).resolves.toEqual({ updated: true });
    expect(await t.run(async (ctx) => ctx.db.get(ids.membershipId))).toMatchObject({
      role: "member",
    });
    expect(await t.run(async (ctx) => ctx.db.get(ids.otherMembershipId!))).toMatchObject({
      role: "owner",
    });
  });

  it("所属解除済み seed の後処理は冪等に完了する", async () => {
    const { t, ids, userId } = await fixture(undefined, false);
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.membershipId);
    });
    for (let i = 0; i < 2; i++) {
      await expect(
        t.mutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
          userId,
          groupId: ids.groupId,
        }),
      ).resolves.toEqual({ deletedCount: 0 });
    }
    expect(await t.run(async (ctx) => ctx.db.get(ids.userRecordId))).toBeNull();
  });
});
