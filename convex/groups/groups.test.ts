import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { seedGroupMemberForE2eHandler } from "./e2e";
import { cancelPendingGroupInvitationHandler } from "./invitations";
import { addMemberByEmailHandler, removeMemberHandler } from "./members";
import { updateGroupNameHandler } from "./mutations";
import { listMyGroupsHandler, listPendingGroupInvitationsHandler } from "./queries";
import { createIdentity, createMockDb } from "./testHelpers";
import { describe, expect, it, vi } from "vitest";

describe("Phase1 owner-only permissions", () => {
  const OWNER_ONLY_ERROR = "グループオーナーのみ実行できます";

  function createMemberContext() {
    const memberId = "https://issuer.example|member";
    const ownerId = "https://issuer.example|owner";
    const ctx = createMockDb({
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId: memberId,
          displayName: "メンバー",
          email: "member@example.com",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-only" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: memberId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-001" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "token-001",
          status: "pending",
          invitedByUserId: ownerId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(memberId, "member@example.com"));
    return { ctx, memberId, ownerId };
  }

  it.each([
    ["updateGroupName", (ctx: MutationCtx) => updateGroupNameHandler(ctx, { name: "新しい名前" })],
    [
      "removeMember",
      (ctx: MutationCtx) =>
        removeMemberHandler(ctx, { targetUserId: "https://issuer.example|other-member" }),
    ],
    [
      "addMemberByEmail",
      (ctx: MutationCtx) => addMemberByEmailHandler(ctx, { email: "new@example.com" }),
    ],
    ["listPendingGroupInvitations", (ctx: QueryCtx) => listPendingGroupInvitationsHandler(ctx)],
    [
      "cancelPendingGroupInvitation",
      (ctx: MutationCtx) =>
        cancelPendingGroupInvitationHandler(ctx, {
          invitationId: "invite-001" as Id<"groupInvitations">,
        }),
    ],
  ] as const)("member は %s を拒否される", async (_operation, runHandler) => {
    const { ctx } = createMemberContext();
    await expect(runHandler(ctx)).rejects.toThrow(OWNER_ONLY_ERROR);
  });
});

describe("seedGroupMemberForE2eHandler", () => {
  it("同じメールの e2e-seed ユーザーを置き換えて seed する", async () => {
    const existingMemberId = "e2e-seed|group-member-old";
    const ctx = createMockDb({
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      users: [
        {
          _id: "user-existing" as Id<"users">,
          userId: existingMemberId,
          displayName: "旧メンバー",
          email: "e2e-removable-member@example.com",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-existing" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: existingMemberId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    const result = await seedGroupMemberForE2eHandler(ctx, {
      groupId: "group-001" as Id<"groups">,
      displayName: "E2E解除対象メンバー",
      email: "e2e-removable-member@example.com",
    });

    expect(result.memberUserId).toMatch(/^e2e-seed\|group-member-/);
    expect(result.memberUserId).not.toBe(existingMemberId);
    expect(ctx.db.delete).toHaveBeenCalledWith("member-existing");
    expect(ctx.db.delete).toHaveBeenCalledWith("user-existing");
    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
  });
});

describe("group lifecycle visibility", () => {
  it("listMyGroupsHandler は deleted / archived グループを一覧から除外する", async () => {
    const ownerId = "https://issuer.example|owner";
    const ctx = createMockDb({
      groups: [
        {
          _id: "group-deleted" as Id<"groups">,
          name: "旧グループ",
          status: "deleted",
          deletedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          _id: "group-archived" as Id<"groups">,
          name: "アーカイブ済み",
          status: "archived",
          archivedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          _id: "group-active" as Id<"groups">,
          name: "現グループ",
          status: "active",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: "group-active" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-deleted" as Id<"groupMembers">,
          groupId: "group-deleted" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-archived" as Id<"groupMembers">,
          groupId: "group-archived" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-active" as Id<"groupMembers">,
          groupId: "group-active" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(listMyGroupsHandler(ctx)).resolves.toEqual([
      expect.objectContaining({ _id: "group-active", name: "現グループ", isActive: true }),
    ]);
  });
});
