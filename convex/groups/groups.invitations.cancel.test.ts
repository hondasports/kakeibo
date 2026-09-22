import type { Id } from "../_generated/dataModel";
import {
  deletePendingGroupInvitationRecordByTokenHandler,
  cancelPendingGroupInvitationHandler,
} from "./invitations";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (invitations) (cancellation)", () => {
  it("deletePendingGroupInvitationRecordByTokenHandler は Clerk ID 未設定の pending 予約だけを削除する", async () => {
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-reserved" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "reserved@example.com",
          token: "reserved-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-sent" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "sent@example.com",
          token: "sent-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          clerkInvitationId: "clerk-sent",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      deletePendingGroupInvitationRecordByTokenHandler(ctx, { token: "reserved-token" }),
    ).resolves.toBe("invite-reserved");
    await expect(
      deletePendingGroupInvitationRecordByTokenHandler(ctx, { token: "sent-token" }),
    ).resolves.toBeNull();
    expect(ctx.db.delete).toHaveBeenCalledTimes(1);
    expect(ctx.db.delete).toHaveBeenCalledWith("invite-reserved");
  });

  it("cancelPendingGroupInvitationHandler は owner が pending 招待をメール単位で revoked にする", async () => {
    const ownerId = "https://issuer.example|owner";
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
      ],
      groupInvitations: [
        {
          _id: "invite-old" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "token-old",
          status: "pending",
          invitedByUserId: ownerId,
          clerkInvitationId: "clerk-old",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-new" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "token-new",
          status: "pending",
          invitedByUserId: ownerId,
          clerkInvitationId: "clerk-new",
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "pending@example.com",
          token: "token-accepted",
          status: "accepted",
          invitedByUserId: ownerId,
          createdAt: 3000,
          updatedAt: 3000,
        },
      ],
    });
    vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(createIdentity(ownerId));

    await expect(
      cancelPendingGroupInvitationHandler(ctx, {
        invitationId: "invite-new" as Id<"groupInvitations">,
      }),
    ).resolves.toEqual({ clerkInvitationIds: ["clerk-old", "clerk-new"] });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId: "group-001",
        actorUserId: ownerId,
        action: "invitation_revoked",
        targetKind: "invitation",
        targetId: "invite-new",
        targetLabel: "pending@example.com",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-old",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-new",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.patch).not.toHaveBeenCalledWith(
      "invite-accepted",
      expect.objectContaining({ status: "revoked" }),
    );
  });

  it("cancelPendingGroupInvitationHandler は member ロールの呼び出しを拒否する", async () => {
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
          _id: "member-member" as Id<"groupMembers">,
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
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(
      createIdentity(memberId, "member@example.com"),
    );

    await expect(
      cancelPendingGroupInvitationHandler(ctx, {
        invitationId: "invite-001" as Id<"groupInvitations">,
      }),
    ).rejects.toThrow("グループオーナーのみ実行できます");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("cancelPendingGroupInvitationHandler は他グループの招待を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
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
      ],
      groupInvitations: [
        {
          _id: "invite-other" as Id<"groupInvitations">,
          groupId: "group-002" as Id<"groups">,
          email: "pending@example.com",
          token: "token-other",
          status: "pending",
          invitedByUserId: ownerId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(createIdentity(ownerId));

    await expect(
      cancelPendingGroupInvitationHandler(ctx, {
        invitationId: "invite-other" as Id<"groupInvitations">,
      }),
    ).rejects.toThrow("現在選択中のグループでのみ実行できます");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("cancelPendingGroupInvitationHandler は accepted 済み招待を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
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
      ],
      groupInvitations: [
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "accepted@example.com",
          token: "token-accepted",
          status: "accepted",
          invitedByUserId: ownerId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(createIdentity(ownerId));

    await expect(
      cancelPendingGroupInvitationHandler(ctx, {
        invitationId: "invite-accepted" as Id<"groupInvitations">,
      }),
    ).rejects.toThrow("この招待は取り消せません");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("cancelPendingGroupInvitationHandler は存在しない招待 ID を拒否する", async () => {
    const ownerId = "https://issuer.example|owner";
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
      ],
      groupInvitations: [],
    });
    vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(createIdentity(ownerId));

    await expect(
      cancelPendingGroupInvitationHandler(ctx, {
        invitationId: "invite-missing" as Id<"groupInvitations">,
      }),
    ).rejects.toThrow("招待が見つかりません");
  });
});
