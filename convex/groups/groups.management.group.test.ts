import type { Id } from "../_generated/dataModel";
import { createGroupHandler, updateGroupNameHandler } from "./mutations";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";

describe("groups (management) (group lifecycle)", () => {
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
});
