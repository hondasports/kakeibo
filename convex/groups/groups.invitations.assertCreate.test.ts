import type { Id } from "../_generated/dataModel";
import {
  assertEmailCanBeInvitedToGroupHandler,
  createGroupInvitationRecordHandler,
} from "./invitations";
import { addMemberByEmailHandler } from "./members";
import { describe, expect, it, vi } from "vitest";
import { MAX_PENDING_GROUP_INVITATIONS } from "../../lib/domain/groups/groupInvitation";
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

describe("groups (invitations) (上限と入力検証)", () => {
  const ownerId = "https://issuer.example|owner";

  function pendingInvitations(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      _id: `invite-${index}` as Id<"groupInvitations">,
      groupId: "group-001" as Id<"groups">,
      email: `invitee${index}@example.com`,
      token: `token-${index}`,
      status: "pending" as const,
      invitedByUserId: ownerId,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    }));
  }

  it("pending が上限未満(上限-1件)なら新規招待を作成できる", async () => {
    const ctx = createMockDb({
      groupInvitations: pendingInvitations(MAX_PENDING_GROUP_INVITATIONS - 1),
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "new@example.com",
        token: "new-token",
        invitedByUserId: ownerId,
      }),
    ).resolves.toEqual(expect.any(String));
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "groupInvitations",
      expect.objectContaining({ email: "new@example.com", status: "pending" }),
    );
  });

  it("pending が上限に達していたら新規招待を拒否し、行を作らない", async () => {
    const ctx = createMockDb({
      groupInvitations: pendingInvitations(MAX_PENDING_GROUP_INVITATIONS),
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "new@example.com",
        token: "new-token",
        invitedByUserId: ownerId,
      }),
    ).rejects.toThrow("未承諾の招待が上限");
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("上限到達時でも pending 済みアドレスへの再招待は許可される", async () => {
    const ctx = createMockDb({
      groupInvitations: pendingInvitations(MAX_PENDING_GROUP_INVITATIONS),
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "invitee3@example.com",
        token: "new-token",
        invitedByUserId: ownerId,
      }),
    ).resolves.toEqual(expect.any(String));
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "invite-3",
      expect.objectContaining({ status: "revoked" }),
    );
    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
  });

  it("他グループの pending は上限に数えない", async () => {
    const ctx = createMockDb({
      groupInvitations: pendingInvitations(MAX_PENDING_GROUP_INVITATIONS).map((invitation) => ({
        ...invitation,
        groupId: "group-other" as Id<"groups">,
      })),
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "new@example.com",
        token: "new-token",
        invitedByUserId: ownerId,
      }),
    ).resolves.toEqual(expect.any(String));
  });

  it("形式不正のメールアドレスは掃除も insert もせず拒否する", async () => {
    const ctx = createMockDb({});

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        groupId: "group-001" as Id<"groups">,
        email: "not-an-email",
        token: "new-token",
        invitedByUserId: ownerId,
      }),
    ).rejects.toThrow("メールアドレスの形式が正しくありません");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe("groups (invitations) (2段階目の確定と同時招待の競合)", () => {
  const ownerId = "https://issuer.example|owner";
  const base = { groupId: "group-001" as Id<"groups">, invitedByUserId: ownerId };

  function pendingFor(email: string) {
    return (ctx: ReturnType<typeof createMockDb>) =>
      ctx.db
        .query("groupInvitations")
        .withIndex("by_group_id_and_status", (q: { eq: (f: string, v: unknown) => unknown }) =>
          q.eq("groupId", "group-001").eq("status", "pending"),
        )
        .collect()
        .then((rows: Array<{ email: string }>) => rows.filter((row) => row.email === email));
  }

  it("後続予約に revoke された予約行は 2 段階目で復活させず、pending を 1 件のまま保つ", async () => {
    const ctx = createMockDb({});
    const email = "race@example.com";

    // 同一メールへの同時 inviteMember: A,B とも予約（1段階目）を通る。B が A を revoke する。
    await createGroupInvitationRecordHandler(ctx, { ...base, email, token: "token-a" });
    await createGroupInvitationRecordHandler(ctx, { ...base, email, token: "token-b" });

    // Clerk 後の 2 段階目: 先に A が確定しようとする（A は superseded）
    await expect(
      createGroupInvitationRecordHandler(ctx, {
        ...base,
        email,
        token: "token-a",
        clerkInvitationId: "clerk-a",
      }),
    ).rejects.toThrow("無効になりました");

    await createGroupInvitationRecordHandler(ctx, {
      ...base,
      email,
      token: "token-b",
      clerkInvitationId: "clerk-b",
    });

    const pending = await pendingFor(email)(ctx);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ token: "token-b", clerkInvitationId: "clerk-b" });
  });

  it("同時招待を重ねても pending 件数は上限を超えない", async () => {
    const ctx = createMockDb({
      groupInvitations: Array.from({ length: MAX_PENDING_GROUP_INVITATIONS - 1 }, (_, index) => ({
        _id: `invite-${index}` as Id<"groupInvitations">,
        groupId: "group-001" as Id<"groups">,
        email: `invitee${index}@example.com`,
        token: `token-${index}`,
        status: "pending" as const,
        invitedByUserId: ownerId,
        createdAt: 1000 + index,
        updatedAt: 1000 + index,
      })),
    });
    const email = "race@example.com";

    await createGroupInvitationRecordHandler(ctx, { ...base, email, token: "token-a" });
    await createGroupInvitationRecordHandler(ctx, { ...base, email, token: "token-b" });
    await expect(
      createGroupInvitationRecordHandler(ctx, {
        ...base,
        email,
        token: "token-a",
        clerkInvitationId: "clerk-a",
      }),
    ).rejects.toThrow("無効になりました");
    await createGroupInvitationRecordHandler(ctx, {
      ...base,
      email,
      token: "token-b",
      clerkInvitationId: "clerk-b",
    });

    const allPending = await ctx.db
      .query("groupInvitations")
      .withIndex("by_group_id_and_status", (q: { eq: (f: string, v: unknown) => unknown }) =>
        q.eq("groupId", "group-001").eq("status", "pending"),
      )
      .collect();
    expect(allPending).toHaveLength(MAX_PENDING_GROUP_INVITATIONS);
  });

  it("現行の予約は 2 段階目で clerkInvitationId が追記され pending のまま", async () => {
    const ctx = createMockDb({});
    const email = "single@example.com";
    await createGroupInvitationRecordHandler(ctx, { ...base, email, token: "token-a" });
    await createGroupInvitationRecordHandler(ctx, {
      ...base,
      email,
      token: "token-a",
      clerkInvitationId: "clerk-a",
    });

    const pending = await pendingFor(email)(ctx);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ token: "token-a", clerkInvitationId: "clerk-a" });
    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
  });

  it("取消済み(revoked)の行は clerkInvitationId 付きで確定しても pending に戻らない", async () => {
    const ctx = createMockDb({
      groupInvitations: [
        {
          _id: "invite-revoked" as Id<"groupInvitations">,
          groupId: "group-001" as Id<"groups">,
          email: "gone@example.com",
          token: "token-gone",
          status: "revoked",
          invitedByUserId: ownerId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await expect(
      createGroupInvitationRecordHandler(ctx, {
        ...base,
        email: "gone@example.com",
        token: "token-gone",
        clerkInvitationId: "clerk-gone",
      }),
    ).rejects.toThrow("無効になりました");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
