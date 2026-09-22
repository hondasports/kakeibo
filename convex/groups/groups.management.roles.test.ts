import type { Id } from "../_generated/dataModel";
import * as groupAdminGuards from "./adminGuards";
import { GROUP_ADMIN_ERRORS } from "./adminGuards";
import { changeMemberRoleHandler } from "./members";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (management) (role changes)", () => {
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
});
