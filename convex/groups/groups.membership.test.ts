import type { Id } from "../_generated/dataModel";
import { deleteGroupMembershipsByUserHandler } from "./e2e";
import { sortGroupMembersForDisplay } from "./memberDisplay";
import { getGroupMembership } from "./membership";
import { createGroupHandler, setActiveGroupHandler } from "./mutations";
import { getGroupMembersHandler, listMyGroupsHandler } from "./queries";
import { createIdentity, createMockDb } from "./testHelpers";
import { describe, expect, it, vi } from "vitest";

describe("groups (membership)", () => {
  it("E2E cleanup は最後の owner を削除する前に残る member を owner へ昇格する", async () => {
    const groupId = "group-cleanup" as Id<"groups">;
    const ctx = createMockDb({
      groupMembers: [
        {
          _id: "membership-owner" as Id<"groupMembers">,
          groupId,
          userId: "owner-user",
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "membership-member" as Id<"groupMembers">,
          groupId,
          userId: "member-user",
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    await deleteGroupMembershipsByUserHandler(ctx, { userId: "owner-user" });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "membership-member",
      expect.objectContaining({ role: "owner" }),
    );
    expect(ctx.db.delete).toHaveBeenCalledWith("membership-owner");
  });

  it("sortGroupMembersForDisplay は owner を先頭にし、member を表示名順に並べる", () => {
    expect(
      sortGroupMembersForDisplay([
        {
          userId: "member-b",
          role: "member",
          displayName: "メンバーB",
          email: "b@example.com",
          isActiveGroup: false,
          createdAt: 2000,
        },
        {
          userId: "owner",
          role: "owner",
          displayName: "オーナー",
          email: "owner@example.com",
          isActiveGroup: true,
          createdAt: 1000,
        },
        {
          userId: "member-a",
          role: "member",
          displayName: "メンバーA",
          email: "a@example.com",
          isActiveGroup: false,
          createdAt: 3000,
        },
      ]),
    ).toEqual([
      {
        userId: "owner",
        role: "owner",
        displayName: "オーナー",
        email: "owner@example.com",
        isActiveGroup: true,
        createdAt: 1000,
      },
      {
        userId: "member-a",
        role: "member",
        displayName: "メンバーA",
        email: "a@example.com",
        isActiveGroup: false,
        createdAt: 3000,
      },
      {
        userId: "member-b",
        role: "member",
        displayName: "メンバーB",
        email: "b@example.com",
        isActiveGroup: false,
        createdAt: 2000,
      },
    ]);
  });

  it("getGroupMembership は activeGroupId が複数所属でも現在のグループを返す", async () => {
    const userId = "https://issuer.example|user-001";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-001" as Id<"users">,
          userId,
          displayName: "ユーザー",
          activeGroupId: "group-002" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-001" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-002" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(getGroupMembership(ctx)).resolves.toEqual({
      membershipId: "member-002",
      groupId: "group-002",
      userId,
      role: "owner",
    });
  });

  it("getGroupMembership は複数所属で activeGroupId がなければ null を返す", async () => {
    const userId = "https://issuer.example|user-002";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-002" as Id<"users">,
          userId,
          displayName: "ユーザー",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-003" as Id<"groupMembers">,
          groupId: "group-003" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-004" as Id<"groupMembers">,
          groupId: "group-004" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(getGroupMembership(ctx)).resolves.toBeNull();
  });

  it("getGroupMembership は削除済み activeGroupId のグループを返さない", async () => {
    const userId = "https://issuer.example|user-deleted-active";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-deleted-active" as Id<"users">,
          userId,
          displayName: "ユーザー",
          activeGroupId: "group-deleted" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groups: [
        {
          _id: "group-deleted" as Id<"groups">,
          name: "削除済み",
          status: "deleted",
          deletedAt: 2000,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      groupMembers: [
        {
          _id: "member-deleted" as Id<"groupMembers">,
          groupId: "group-deleted" as Id<"groups">,
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(getGroupMembership(ctx)).resolves.toBeNull();
  });

  it("createGroupHandler は既存の所属があっても新しいグループを作り、activeGroupId を更新する", async () => {
    const userId = "https://issuer.example|owner";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId,
          displayName: "オーナー",
          activeGroupId: "group-old" as Id<"groups">,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-old" as Id<"groupMembers">,
          groupId: "group-old" as Id<"groups">,
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    const groupId = await createGroupHandler(ctx, { name: "佐藤家" });

    expect(groupId).toMatch(/^groups-/);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "groupMembers",
      expect.objectContaining({
        userId,
        role: "owner",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "user-owner",
      expect.objectContaining({
        activeGroupId: groupId,
      }),
    );
  });

  it("listMyGroupsHandler は現在の activeGroup を isActive 付きで返す", async () => {
    const userId = "https://issuer.example|user-003";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-003" as Id<"users">,
          userId,
          displayName: "ユーザー",
          activeGroupId: "group-002" as Id<"groups">,
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
        {
          _id: "group-002" as Id<"groups">,
          name: "鈴木家",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-005" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "member-006" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(listMyGroupsHandler(ctx)).resolves.toEqual([
      {
        _id: "group-001",
        name: "佐藤家",
        clerkOrganizationId: null,
        role: "member",
        createdAt: 1000,
        isActive: false,
      },
      {
        _id: "group-002",
        name: "鈴木家",
        clerkOrganizationId: null,
        role: "owner",
        createdAt: 1000,
        isActive: true,
      },
    ]);
  });

  it("getGroupMembersHandler は active group のメンバーだけを owner 優先で返す", async () => {
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
        {
          _id: "user-member-a" as Id<"users">,
          userId: "https://issuer.example|member-a",
          displayName: "メンバーA",
          email: "member-a@example.com",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-member-b" as Id<"users">,
          userId: "https://issuer.example|member-b",
          displayName: "メンバーB",
          email: "member-b@example.com",
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
        {
          _id: "group-002" as Id<"groups">,
          name: "鈴木家",
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
        {
          _id: "member-b" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: "https://issuer.example|member-b",
          role: "member",
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          _id: "member-a" as Id<"groupMembers">,
          groupId: "group-001" as Id<"groups">,
          userId: "https://issuer.example|member-a",
          role: "member",
          createdAt: 3000,
          updatedAt: 3000,
        },
        {
          _id: "member-other-group" as Id<"groupMembers">,
          groupId: "group-002" as Id<"groups">,
          userId: "https://issuer.example|other-group-member",
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(getGroupMembersHandler(ctx)).resolves.toEqual([
      {
        userId,
        role: "owner",
        displayName: "オーナー太郎",
        email: "owner@example.com",
        isActiveGroup: true,
        createdAt: 1000,
      },
      {
        userId: "https://issuer.example|member-a",
        role: "member",
        displayName: "メンバーA",
        email: "member-a@example.com",
        isActiveGroup: false,
        createdAt: 3000,
      },
      {
        userId: "https://issuer.example|member-b",
        role: "member",
        displayName: "メンバーB",
        email: "member-b@example.com",
        isActiveGroup: false,
        createdAt: 2000,
      },
    ]);
  });

  it("getGroupMembersHandler はグループ未所属ならエラーになる", async () => {
    const userId = "https://issuer.example|lonely-user";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-lonely" as Id<"users">,
          userId,
          displayName: "ユーザー",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(getGroupMembersHandler(ctx)).rejects.toThrow("グループに所属していません");
  });

  it("setActiveGroupHandler は所属しているグループを active に切り替える", async () => {
    const userId = "https://issuer.example|user-004";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-004" as Id<"users">,
          userId,
          displayName: "ユーザー",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-007" as Id<"groupMembers">,
          groupId: "group-007" as Id<"groups">,
          userId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groups: [
        {
          _id: "group-007" as Id<"groups">,
          name: "切替先グループ",
          status: "active",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(userId));

    await expect(
      setActiveGroupHandler(ctx, { groupId: "group-007" as Id<"groups"> }),
    ).resolves.toEqual("group-007");
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "user-004",
      expect.objectContaining({ activeGroupId: "group-007" }),
    );
  });
});
