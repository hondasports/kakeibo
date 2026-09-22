import type { Id } from "../_generated/dataModel";
import { addMemberByEmailHandler, removeMemberHandler } from "./members";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (management) (member management)", () => {
  it("removeMemberHandler は他メンバー削除後に残りの所属へ activeGroupId を戻す", async () => {
    const ownerId = "https://issuer.example|owner";
    const targetUserId = "https://issuer.example|member";
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
        {
          _id: "user-member" as Id<"users">,
          userId: targetUserId,
          displayName: "メンバー",
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
        {
          _id: "member-target-other" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId: targetUserId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(removeMemberHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.delete).toHaveBeenCalledWith("member-target");
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId: "group-001",
        actorUserId: ownerId,
        action: "member_removed",
        targetKind: "member",
        targetId: targetUserId,
        targetLabel: "メンバー",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "user-member",
      expect.objectContaining({ activeGroupId: "group-002" }),
    );
  });

  it("addMemberByEmailHandler は member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
    const ctx = createMockDb({
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
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(memberId, "member@example.com"));

    await expect(addMemberByEmailHandler(ctx, { email: "new@example.com" })).rejects.toThrow(
      "グループオーナーのみ実行できます",
    );
  });

  it("removeMemberHandler は member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
    const ctx = createMockDb({
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
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(memberId, "member@example.com"));

    await expect(
      removeMemberHandler(ctx, { targetUserId: "https://issuer.example|other" }),
    ).rejects.toThrow("グループオーナーのみ実行できます");
  });

  it("removeMemberHandler は owner ロールの対象メンバーを拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherOwnerId = "https://issuer.example|other-owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          email: "owner@example.com",
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

    await expect(removeMemberHandler(ctx, { targetUserId: otherOwnerId })).rejects.toThrow(
      "オーナーはグループから外せません",
    );
  });

  it("removeMemberHandler は自分自身の解除を拒否する", async () => {
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

    await expect(removeMemberHandler(ctx, { targetUserId: ownerId })).rejects.toThrow(
      "自分自身に対してこの操作はできません",
    );
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it("removeMemberHandler は active group に所属しないユーザーを拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherGroupMemberId = "https://issuer.example|other-group-member";
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

    await expect(removeMemberHandler(ctx, { targetUserId: otherGroupMemberId })).rejects.toThrow(
      "指定されたメンバーが見つかりません",
    );
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it("removeMemberHandler は users レコードを削除しない", async () => {
    const ownerId = "https://issuer.example|owner";
    const targetUserId = "https://issuer.example|member";
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
        {
          _id: "user-member" as Id<"users">,
          userId: targetUserId,
          displayName: "メンバー",
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

    await expect(removeMemberHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.delete).toHaveBeenCalledTimes(1);
    expect(ctx.db.delete).toHaveBeenCalledWith("member-target");
    expect(ctx.db.delete).not.toHaveBeenCalledWith("user-member");
  });

  it("removeMemberHandler は対象メンバーの pending / accepted 招待を revoked にする", async () => {
    const ownerId = "https://issuer.example|owner";
    const targetUserId = "https://issuer.example|member";
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
        {
          _id: "user-member" as Id<"users">,
          userId: targetUserId,
          displayName: "メンバー",
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
      groupInvitations: [
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "member@example.com",
          token: "accepted-token",
          status: "accepted",
          invitedByUserId: ownerId,
          acceptedByUserId: targetUserId,
          acceptedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(removeMemberHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId: "group-001",
        actorUserId: ownerId,
        action: "member_removed",
        targetKind: "member",
        targetId: targetUserId,
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-accepted",
      expect.objectContaining({ status: "revoked" }),
    );
  });
});
