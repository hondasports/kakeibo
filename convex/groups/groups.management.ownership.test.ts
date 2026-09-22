import type { Id } from "../_generated/dataModel";
import { GROUP_ADMIN_ERRORS } from "./adminGuards";
import { transferGroupOwnershipHandler } from "./members";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (management) (ownership transfer)", () => {
  it("transferGroupOwnershipHandler は owner 権限を member に譲渡し監査ログを残す", async () => {
    const ownerId = "https://issuer.example|owner";
    const targetUserId = "https://issuer.example|member";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "現オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-member" as Id<"users">,
          userId: targetUserId,
          displayName: "譲渡先",
          email: "member@example.com",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-target" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: targetUserId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenNthCalledWith(
      1,
      "member-target",
      expect.objectContaining({ role: "owner" }),
    );
    expect(ctx.db.patch).toHaveBeenNthCalledWith(
      2,
      "member-owner",
      expect.objectContaining({ role: "member" }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        action: "owner_transferred",
        targetId: targetUserId,
        targetLabel: "譲渡先",
        beforeValue: "オーナー: 現オーナー",
        afterValue: "オーナー: 譲渡先（現オーナー → メンバー）",
      }),
    );
  });

  it("transferGroupOwnershipHandler は共同 owner がいる場合も譲渡できる", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherOwnerId = "https://issuer.example|other-owner";
    const targetUserId = "https://issuer.example|member";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー1",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-other-owner" as Id<"users">,
          userId: otherOwnerId,
          displayName: "オーナー2",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-member" as Id<"users">,
          userId: targetUserId,
          displayName: "譲渡先",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-other-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: otherOwnerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-target" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: targetUserId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-target",
      expect.objectContaining({ role: "owner" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-owner",
      expect.objectContaining({ role: "member" }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalledWith("member-other-owner", expect.anything());
  });

  it("transferGroupOwnershipHandler は member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
    const targetUserId = "https://issuer.example|other";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId: memberId,
          displayName: "メンバー",
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
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(memberId));

    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).rejects.toThrow(
      GROUP_ADMIN_ERRORS.OWNER_ONLY,
    );
  });

  it("transferGroupOwnershipHandler は自分自身への譲渡を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(transferGroupOwnershipHandler(ctx, { targetUserId: ownerId })).rejects.toThrow(
      GROUP_ADMIN_ERRORS.SELF_OPERATION_FORBIDDEN,
    );
  });

  it("transferGroupOwnershipHandler は他グループのメンバーへの譲渡を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherGroupMemberId = "https://issuer.example|other-group";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-other-group" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId: otherGroupMemberId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(
      transferGroupOwnershipHandler(ctx, { targetUserId: otherGroupMemberId }),
    ).rejects.toThrow("指定されたメンバーが見つかりません");
  });

  it("transferGroupOwnershipHandler は pending 招待中ユーザー（groupMembers 不在）への譲渡を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const pendingInviteUserId = "https://issuer.example|pending-only";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-pending" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "token-pending",
          status: "pending",
          invitedByUserId: ownerId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(
      transferGroupOwnershipHandler(ctx, { targetUserId: pendingInviteUserId }),
    ).rejects.toThrow("指定されたメンバーが見つかりません");
  });

  it("transferGroupOwnershipHandler は owner ロールの譲渡先を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherOwnerId = "https://issuer.example|other-owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー1",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-other-owner" as Id<"users">,
          userId: otherOwnerId,
          displayName: "オーナー2",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-other-owner" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: otherOwnerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(
      transferGroupOwnershipHandler(ctx, { targetUserId: otherOwnerId }),
    ).rejects.toThrow(GROUP_ADMIN_ERRORS.TRANSFER_TARGET_MUST_BE_MEMBER);
  });
});
