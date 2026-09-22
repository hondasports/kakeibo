import type { Id } from "../_generated/dataModel";
import {
  assertEmailCanBeInvitedToGroupHandler,
  createGroupInvitationRecordHandler,
} from "./invitations";
import { addMemberByEmailHandler } from "./members";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (invitations) (assert and create)", () => {
  it("addMemberByEmailHandler は対象ユーザーが別グループ所属済みでも現在グループに追加できる", async () => {
    const ownerId = "https://issuer.example|owner";
    const memberId = "https://issuer.example|member";
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
        {
          _id: "user-member" as Id<"users">,
          userId: memberId,
          displayName: "メンバー",
          email: "member@example.com",
          activeGroupId: "group-002" as Id<"groups">,
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
          _id: "member-existing" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId: memberId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    await expect(
      addMemberByEmailHandler(ctx, { email: "member@example.com" }),
    ).resolves.toBeUndefined();

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "groupMembers",
      expect.objectContaining({
        groupId: "group-001",
        userId: memberId,
        role: "member",
      }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "user-member",
      expect.objectContaining({ activeGroupId: "group-001" }),
    );
  });

  it("assertEmailCanBeInvitedToGroupHandler は現在グループの既存メンバーを拒否する", async () => {
    const ctx = createMockDb({
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId: "https://issuer.example|member",
          displayName: "メンバー",
          email: "member@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-current" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: "https://issuer.example|member",
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: " MEMBER@example.com ",
      }),
    ).rejects.toThrow("このユーザーはすでにグループに参加しています");
  });

  it("assertEmailCanBeInvitedToGroupHandler は Gmail の dot / plus alias を同一メールボックスとして扱う", async () => {
    const ctx = createMockDb({
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId: "https://issuer.example|member",
          displayName: "メンバー",
          email: "family.budget+invite@gmail.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-current" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: "https://issuer.example|member",
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "familybudget@gmail.com",
      }),
    ).rejects.toThrow("このユーザーはすでにグループに参加しています");
  });

  it("assertEmailCanBeInvitedToGroupHandler は pending だけでは拒否しない（作成時に古い招待を無効化する）", async () => {
    const baseInvitation = {
      groupId: "group-001" as Id<"groups">,
      invitedByUserId: "https://issuer.example|owner",
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-pending" as Id<"groupInvitations">,
          ...baseInvitation,
          email: "pending@example.com",
          token: "pending-token",
          status: "pending",
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "pending@example.com",
      }),
    ).resolves.toBeNull();
  });

  it("assertEmailCanBeInvitedToGroupHandler は所属中メンバーの accepted 招待を拒否する", async () => {
    const memberUserId = "https://issuer.example|member";
    const ctx = createMockDb({
      groupMembers: [
        {
          _id: "member-accepted" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: memberUserId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "accepted@example.com",
          token: "accepted-token",
          status: "accepted",
          invitedByUserId: "https://issuer.example|owner",
          acceptedByUserId: memberUserId,
          acceptedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "accepted@example.com",
      }),
    ).rejects.toThrow("このメールアドレスの招待はすでに承認済みです");
  });

  it("assertEmailCanBeInvitedToGroupHandler はグループから外したユーザーの accepted 招待があっても再招待を許可する", async () => {
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "removed@example.com",
          token: "accepted-token",
          status: "accepted",
          invitedByUserId: "https://issuer.example|owner",
          acceptedByUserId: "https://issuer.example|removed",
          acceptedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "removed@example.com",
      }),
    ).resolves.toBeNull();
  });

  it("assertEmailCanBeInvitedToGroupHandler は revoked / expired と別グループの重複を許可する", async () => {
    const ctx = createMockDb({
      users: [
        {
          _id: "user-other" as Id<"users">,
          userId: "https://issuer.example|other",
          displayName: "別グループメンバー",
          email: "member@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-other" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId: "https://issuer.example|other",
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-revoked" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "revoked@example.com",
          token: "revoked-token",
          status: "revoked",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-expired" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "expired@example.com",
          token: "expired-token",
          status: "expired",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-other-group" as Id<"groupInvitations">,
          groupId: "group-002" as Id<"groups">,
          email: "pending@example.com",
          token: "other-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "member@example.com",
      }),
    ).resolves.toBeNull();
    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "revoked@example.com",
      }),
    ).resolves.toBeNull();
    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "expired@example.com",
      }),
    ).resolves.toBeNull();
    await expect(
      assertEmailCanBeInvitedToGroupHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "pending@example.com",
      }),
    ).resolves.toBeNull();
  });

  it("createGroupInvitationRecordHandler は既存 pending を無効化してから新しい招待を作成する", async () => {
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-pending" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "pending-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "pending@example.com",
        token: "new-token",
        invitedByUserId: "https://issuer.example|owner",
        clerkInvitationId: "clerk-new",
      }),
    ).resolves.toEqual(expect.any(String));
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-pending",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.insert).toHaveBeenCalled();
  });

  it("createGroupInvitationRecordHandler は複数の pending をまとめて無効化して再招待できる", async () => {
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-pending-1" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "dup@example.com",
          token: "pending-token-1",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-pending-2" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "dup@example.com",
          token: "pending-token-2",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "dup@example.com",
        token: "new-token",
        invitedByUserId: "https://issuer.example|owner",
      }),
    ).resolves.toEqual(expect.any(String));
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-pending-1",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-pending-2",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.insert).toHaveBeenCalled();
  });
});
