import type { Id } from "../_generated/dataModel";
import {
  acceptGroupInvitationForVerifiedEmailsHandler,
  acceptGroupInvitationHandler,
  assertEmailCanBeInvitedToGroupHandler,
  createGroupInvitationRecordHandler,
  deletePendingGroupInvitationRecordByTokenHandler,
  dedupePendingGroupInvitationsByEmail,
  getInvitationEmailKey,
  invitationEmailsMatch,
  invitationEmailsMatchAny,
  cancelPendingGroupInvitationHandler,
} from "./invitations";
import { addMemberByEmailHandler } from "./members";
import { listPendingGroupInvitationsHandler } from "./queries";
import { createIdentity, createMockDb } from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("groups (invitations)", () => {
  it("invitationEmailsMatch は Gmail の plus tag とドット違いを同一メールボックスとして扱う", () => {
    expect(invitationEmailsMatch("invitee@gmail.com", "in.vi.tee+family@gmail.com")).toBe(true);
    expect(invitationEmailsMatch("invitee@googlemail.com", "in.vi.tee+family@gmail.com")).toBe(
      true,
    );
    expect(invitationEmailsMatch("invitee@example.com", "invitee+family@example.com")).toBe(false);
  });

  it("invitationEmailsMatchAny は Clerk の検証済みメール候補も照合する", () => {
    expect(
      invitationEmailsMatchAny(
        ["primary@example.com", "in.vi.tee+family@gmail.com"],
        "invitee@gmail.com",
      ),
    ).toBe(true);
    expect(invitationEmailsMatchAny(["primary@example.com"], "invitee@example.com")).toBe(false);
  });

  it("listPendingGroupInvitationsHandler は active group の pending 招待だけを新しい順で返す", async () => {
    const userId = "https://issuer.example|owner-user";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId,
          displayName: "オーナー太郎",
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
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-old" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "old@example.com",
          token: "old-token",
          status: "pending",
          invitedByUserId: userId,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-new" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "new@example.com",
          token: "new-token",
          status: "pending",
          invitedByUserId: userId,
          createdAt: 3000,
          updatedAt: 3000,
        },
        {
          _id: "invite-accepted" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "accepted@example.com",
          token: "accepted-token",
          status: "accepted",
          invitedByUserId: userId,
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          _id: "invite-other-group" as Id<"groupInvitations">,
          groupId: "group-002" as Id<"groups">,
          email: "other@example.com",
          token: "other-token",
          status: "pending",
          invitedByUserId: userId,
          createdAt: 4000,
          updatedAt: 4000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(listPendingGroupInvitationsHandler(ctx)).resolves.toEqual([
      {
        _id: "invite-new",
        email: "new@example.com",
        status: "pending",
        createdAt: 3000,
      },
      {
        _id: "invite-old",
        email: "old@example.com",
        status: "pending",
        createdAt: 1000,
      },
    ]);
  });

  it("listPendingGroupInvitationsHandler は同一メールの pending を最新 1 件にまとめる", async () => {
    const userId = "https://issuer.example|owner-user";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId,
          displayName: "オーナー太郎",
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
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-old-dup" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "dup@example.com",
          token: "old-dup-token",
          status: "pending",
          invitedByUserId: userId,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "invite-new-dup" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "dup@example.com",
          token: "new-dup-token",
          status: "pending",
          invitedByUserId: userId,
          createdAt: 3000,
          updatedAt: 3000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(listPendingGroupInvitationsHandler(ctx)).resolves.toEqual([
      {
        _id: "invite-new-dup",
        email: "dup@example.com",
        status: "pending",
        createdAt: 3000,
      },
    ]);
  });

  it("dedupePendingGroupInvitationsByEmail は Gmail alias を同一メールとしてまとめる", () => {
    const invitations = dedupePendingGroupInvitationsByEmail([
      {
        _id: "invite-alias-old" as Id<"groupInvitations">,
        email: "a.b.c@gmail.com",
        status: "pending",
        createdAt: 1000,
      },
      {
        _id: "invite-alias-new" as Id<"groupInvitations">,
        email: "abc@gmail.com",
        status: "pending",
        createdAt: 2000,
      },
    ]);

    expect(invitations).toEqual([
      {
        _id: "invite-alias-new",
        email: "abc@gmail.com",
        status: "pending",
        createdAt: 2000,
      },
    ]);
    expect(getInvitationEmailKey("a.b.c@gmail.com")).toBe(getInvitationEmailKey("abc@gmail.com"));
  });

  it("listPendingGroupInvitationsHandler は member から呼ぶと拒否する", async () => {
    const userId = "https://issuer.example|member-user";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId,
          displayName: "メンバー",
          email: "member@example.com",
          activeGroupId: "group-001" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-user" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(userId, "member@example.com"));

    await expect(listPendingGroupInvitationsHandler(ctx)).rejects.toThrow(
      "グループオーナーのみ実行できます",
    );
  });

  it("acceptGroupInvitationHandler は一致するメールだけを受け入れ、activeGroupId を更新する", async () => {
    const userId = "https://issuer.example|invitee";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-invitee" as Id<"users">,
          userId,
          displayName: "招待先",
          email: "invitee@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groups: [
        {
          _id: "group-100" as Id<"groups">,
          name: "招待元",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-001" as Id<"groupInvitations">,
          groupId: "group-100" as Id<"groups">,
          email: "invitee@example.com",
          token: "invite-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          clerkInvitationId: "clerk-invite-001",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(userId, "invitee@example.com"));

    await expect(acceptGroupInvitationHandler(ctx, { token: "invite-token" })).resolves.toEqual(
      "group-100",
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "groupMembers",
      expect.objectContaining({
        groupId: "group-100",
        userId,
        role: "member",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "user-invitee",
      expect.objectContaining({ activeGroupId: "group-100" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-001",
      expect.objectContaining({ status: "accepted" }),
    );
  });

  it("acceptGroupInvitationHandler は受け入れ後に同一メールの他 pending を revoked にする", async () => {
    const userId = "https://issuer.example|invitee";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-invitee" as Id<"users">,
          userId,
          displayName: "招待先",
          email: "invitee@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groups: [
        {
          _id: "group-100" as Id<"groups">,
          name: "招待元",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-primary" as Id<"groupInvitations">,
          groupId: "group-100" as Id<"groups">,
          email: "invitee@example.com",
          token: "invite-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          clerkInvitationId: "clerk-invite-001",
          createdAt: 3000,
          updatedAt: 3000,
        },
        {
          _id: "invite-duplicate" as Id<"groupInvitations">,
          groupId: "group-100" as Id<"groups">,
          email: "invitee@example.com",
          token: "old-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(userId, "invitee@example.com"));

    await expect(acceptGroupInvitationHandler(ctx, { token: "invite-token" })).resolves.toEqual(
      "group-100",
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-duplicate",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-primary",
      expect.objectContaining({ status: "accepted" }),
    );
  });

  it("acceptGroupInvitationHandler はメール不一致なら拒否する", async () => {
    const userId = "https://issuer.example|invitee";
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-002" as Id<"groupInvitations">,
          groupId: "group-100" as Id<"groups">,
          email: "invitee@example.com",
          token: "invite-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(userId, "other@example.com"));

    await expect(acceptGroupInvitationHandler(ctx, { token: "invite-token" })).rejects.toThrow(
      ConvexError,
    );
  });

  it("acceptGroupInvitationForVerifiedEmailsHandler は検証済みメール候補が一致すれば受け入れる", async () => {
    const userId = "https://issuer.example|invitee";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-invitee" as Id<"users">,
          userId,
          displayName: "招待先",
          email: "primary@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupInvitations: [
        {
          _id: "invite-verified" as Id<"groupInvitations">,
          groupId: "group-verified" as Id<"groups">,
          email: "invitee@example.com",
          token: "invite-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
        token: "invite-token",
        acceptedUserId: userId,
        acceptedEmails: ["primary@example.com", "invitee@example.com"],
      }),
    ).resolves.toEqual("group-verified");
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "groupMembers",
      expect.objectContaining({
        groupId: "group-verified",
        userId,
        role: "member",
      }),
    );
  });

  it("acceptGroupInvitationForVerifiedEmailsHandler は検証済みメール候補が不一致なら拒否する", async () => {
    const userId = "https://issuer.example|invitee";
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-unmatched" as Id<"groupInvitations">,
          groupId: "group-unmatched" as Id<"groups">,
          email: "invitee@example.com",
          token: "invite-token",
          status: "pending",
          invitedByUserId: "https://issuer.example|owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
        token: "invite-token",
        acceptedUserId: userId,
        acceptedEmails: ["primary@example.com"],
      }),
    ).rejects.toThrow(ConvexError);
  });

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
