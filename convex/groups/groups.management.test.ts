import type { Id } from "../_generated/dataModel";
import * as groupAdminGuards from "./adminGuards";
import { GROUP_ADMIN_ERRORS } from "./adminGuards";
import {
  addMemberByEmailHandler,
  changeMemberRoleHandler,
  removeMemberHandler,
  transferGroupOwnershipHandler,
} from "./members";
import { createGroupHandler, updateGroupNameHandler } from "./mutations";
import { createIdentity, createMockDb } from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("groups (management)", () => {
  it("createGroupHandler は空文字を拒否する", async () => {
    const userId = "https://issuer.example|owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId,
          displayName: "オーナー",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(createGroupHandler(ctx, { name: "   " })).rejects.toThrow(
      "グループ名を入力してください",
    );
  });

  it("createGroupHandler は長すぎる名前を拒否する", async () => {
    const userId = "https://issuer.example|owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId,
          displayName: "オーナー",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(createGroupHandler(ctx, { name: "あ".repeat(51) })).rejects.toThrow(
      "グループ名は50文字以内で入力してください",
    );
  });

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

  it("updateGroupNameHandler は owner が active group の名前を更新する", async () => {
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
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
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

    await expect(updateGroupNameHandler(ctx, { name: " 鈴木家 " })).resolves.toEqual("group-001");
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "group-001",
      expect.objectContaining({ name: "鈴木家" }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId: "group-001",
        actorUserId: ownerId,
        action: "group_name_changed",
        beforeValue: "佐藤家",
        afterValue: "鈴木家",
      }),
    );
  });

  it("updateGroupNameHandler は同名の再保存で patch も監査ログも残さない", async () => {
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
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
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

    await expect(updateGroupNameHandler(ctx, { name: "佐藤家" })).resolves.toEqual("group-001");
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("updateGroupNameHandler は空文字を拒否する", async () => {
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
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
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

    await expect(updateGroupNameHandler(ctx, { name: "   " })).rejects.toThrow(
      "グループ名を入力してください",
    );
  });

  it("updateGroupNameHandler は長すぎる名前を拒否する", async () => {
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
      groups: [
        {
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
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

    await expect(updateGroupNameHandler(ctx, { name: "あ".repeat(51) })).rejects.toThrow(
      "グループ名は50文字以内で入力してください",
    );
  });

  it("updateGroupNameHandler は member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
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
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(memberId, "member@example.com"));

    await expect(updateGroupNameHandler(ctx, { name: "新しい名前" })).rejects.toThrow(
      "グループオーナーのみ実行できます",
    );
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

  it("changeMemberRoleHandler は member を owner に昇格し監査ログを残す", async () => {
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
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(
      changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" }),
    ).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-target",
      expect.objectContaining({ role: "owner" }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        action: "member_role_changed",
        beforeValue: "メンバー",
        afterValue: "オーナー",
        targetId: targetUserId,
      }),
    );
  });

  it("changeMemberRoleHandler は member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
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

    await expect(
      changeMemberRoleHandler(ctx, {
        targetUserId: "https://issuer.example|other",
        newRole: "owner",
      }),
    ).rejects.toThrow("グループオーナーのみ実行できます");
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("changeMemberRoleHandler は自分自身のロール変更を拒否する", async () => {
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

    await expect(
      changeMemberRoleHandler(ctx, { targetUserId: ownerId, newRole: "member" }),
    ).rejects.toThrow("自分自身に対してこの操作はできません");
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("changeMemberRoleHandler は共同オーナーを member に降格できる", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherOwnerId = "https://issuer.example|other-owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "操作者",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-other-owner" as Id<"users">,
          userId: otherOwnerId,
          displayName: "共同オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-operator" as Id<"groupMembers">,
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
      changeMemberRoleHandler(ctx, { targetUserId: otherOwnerId, newRole: "member" }),
    ).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-other-owner",
      expect.objectContaining({ role: "member" }),
    );
  });

  it("changeMemberRoleHandler は他グループの対象を拒否して副作用を残さない", async () => {
    const ownerId = "https://issuer.example|owner";
    const targetUserId = "https://issuer.example|other-group-member";
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
          userId: targetUserId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" })).rejects.toThrow(
      "指定されたメンバーが見つかりません",
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("changeMemberRoleHandler は owner invariant 違反時に副作用を残さない", async () => {
    const ownerId = "https://issuer.example|owner";
    const otherOwnerId = "https://issuer.example|other-owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "操作者",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-other-owner" as Id<"users">,
          userId: otherOwnerId,
          displayName: "共同オーナー",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-operator" as Id<"groupMembers">,
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

    const guardSpy = vi
      .spyOn(groupAdminGuards, "assertAnotherGroupOwnerRemains")
      .mockRejectedValue(new ConvexError(GROUP_ADMIN_ERRORS.LAST_OWNER_PROTECTED));

    await expect(
      changeMemberRoleHandler(ctx, { targetUserId: otherOwnerId, newRole: "member" }),
    ).rejects.toThrow(GROUP_ADMIN_ERRORS.LAST_OWNER_PROTECTED);
    expect(guardSpy).toHaveBeenCalledWith(ctx, "group-001", "member-other-owner");
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();

    guardSpy.mockRestore();
  });

  it("changeMemberRoleHandler は同じロールへの変更を拒否する", async () => {
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

    await expect(changeMemberRoleHandler(ctx, { targetUserId, newRole: "member" })).rejects.toThrow(
      "すでに同じロールです",
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

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
