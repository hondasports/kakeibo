import type { Id } from "../_generated/dataModel";
import {
  dedupePendingGroupInvitationsByEmail,
  getInvitationEmailKey,
  invitationEmailsMatch,
  invitationEmailsMatchAny,
} from "./invitations";
import { listPendingGroupInvitationsHandler } from "./queries";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (invitations) (matching and listing)", () => {
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
});
