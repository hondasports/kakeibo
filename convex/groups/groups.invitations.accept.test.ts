import type { Id } from "../_generated/dataModel";
import {
  acceptGroupInvitationForVerifiedEmailsHandler,
  acceptGroupInvitationHandler,
} from "./invitations";
import { listPendingGroupInvitationsHandler } from "./queries";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (invitations) (acceptance)", () => {
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
});
