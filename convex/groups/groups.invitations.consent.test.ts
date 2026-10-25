import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  previewGroupInvitationForVerifiedEmailsHandler,
  acceptGroupInvitationHandler,
  acceptGroupInvitationForVerifiedEmailsHandler,
} from "./invitations";
import { createIdentity, createMockDb } from "./testHelpers";

function setup() {
  return createMockDb({
    groups: [
      { _id: "group-old" as Id<"groups">, name: "現在の家計", createdAt: 1, updatedAt: 1 },
      { _id: "group-new" as Id<"groups">, name: "招待先", createdAt: 1, updatedAt: 1 },
    ],
    users: [
      {
        _id: "user-recipient" as Id<"users">,
        userId: "recipient",
        displayName: "受信者",
        activeGroupId: "group-old" as Id<"groups">,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    groupInvitations: [
      {
        _id: "invite" as Id<"groupInvitations">,
        groupId: "group-new" as Id<"groups">,
        email: "recipient@example.test",
        token: "invite-token",
        status: "pending",
        invitedByUserId: "owner",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
}
const recipient = {
  token: "invite-token",
  acceptedUserId: "recipient",
  acceptedEmails: ["recipient@example.test"],
};

describe("招待受諾時のグループ切替同意", () => {
  it("既存active groupの置換は同意なしで保存しない", async () => {
    const ctx = setup();
    await expect(acceptGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).rejects.toThrow(
      "表示するグループの切り替えを確認してください",
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("同意後にactive groupが変わった場合も保存しない", async () => {
    const ctx = setup();
    await expect(
      acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
        ...recipient,
        switchActiveGroup: true,
        expectedActiveGroupId: "group-stale",
      }),
    ).rejects.toThrow("表示するグループが変わりました。招待内容を再確認してください");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

it("切替に同意した本人の受諾でのみ所属とactive groupを更新する", async () => {
  const ctx = setup();
  await expect(
    acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
      ...recipient,
      switchActiveGroup: true,
      expectedActiveGroupId: "group-old",
    }),
  ).resolves.toBe("group-new");
  expect(ctx.db.insert).toHaveBeenCalledWith(
    "groupMembers",
    expect.objectContaining({ userId: "recipient", groupId: "group-new", role: "member" }),
  );
  expect(ctx.db.patch).toHaveBeenCalledWith(
    "user-recipient",
    expect.objectContaining({ activeGroupId: "group-new" }),
  );
});

it("招待確認は宛先と切替元を返し、membership・active group・招待状態を保存しない", async () => {
  const ctx = setup();
  await ctx.db.insert("groupMembers", {
    groupId: "group-old" as Id<"groups">,
    userId: "recipient",
    role: "owner",
    createdAt: 1,
    updatedAt: 1,
  });
  ctx.db.insert.mockClear();
  await expect(previewGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).resolves.toEqual({
    groupId: "group-new",
    groupName: "招待先",
    activeGroupId: "group-old",
    activeGroupName: "現在の家計",
    isExistingMember: false,
  });
  expect(ctx.db.insert).not.toHaveBeenCalled();
  expect(ctx.db.patch).not.toHaveBeenCalled();
});

it("既存のowner所属は重複・降格せず受諾する", async () => {
  const ctx = setup();
  const memberId = await ctx.db.insert("groupMembers", {
    groupId: "group-new" as Id<"groups">,
    userId: "recipient",
    role: "owner",
    createdAt: 1,
    updatedAt: 1,
  });
  ctx.db.insert.mockClear();
  await acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
    ...recipient,
    switchActiveGroup: true,
    expectedActiveGroupId: "group-old",
  });
  expect(ctx.db.insert).not.toHaveBeenCalled();
  expect(await ctx.db.get(memberId as Id<"groupMembers">)).toMatchObject({ role: "owner" });
});

it.each(["expired", "revoked", "accepted"] as const)(
  "%s の招待は確認・受諾ともに拒否する",
  async (status) => {
    const ctx = setup();
    await ctx.db.patch("invite" as Id<"groupInvitations">, { status });
    ctx.db.patch.mockClear();
    await expect(previewGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).rejects.toThrow(
      "招待が見つかりません",
    );
    await expect(acceptGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).rejects.toThrow(
      "招待が見つかりません",
    );
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  },
);

it.each(["deleted", "deleting", "archived"] as const)(
  "%s のグループへの招待は確認・受諾ともに拒否する",
  async (status) => {
    const ctx = setup();
    await ctx.db.patch("group-new" as Id<"groups">, { status });
    ctx.db.patch.mockClear();
    await expect(previewGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).rejects.toThrow();
    await expect(acceptGroupInvitationForVerifiedEmailsHandler(ctx, recipient)).rejects.toThrow();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  },
);

it("メール不一致では宛先情報を返さず、受諾も保存しない", async () => {
  const ctx = setup();
  const wrongRecipient = { ...recipient, acceptedEmails: ["other@example.test"] };
  await expect(previewGroupInvitationForVerifiedEmailsHandler(ctx, wrongRecipient)).rejects.toThrow(
    "招待先メールアドレスと一致しません",
  );
  await expect(acceptGroupInvitationForVerifiedEmailsHandler(ctx, wrongRecipient)).rejects.toThrow(
    "招待先メールアドレスと一致しません",
  );
  expect(ctx.db.insert).not.toHaveBeenCalled();
  expect(ctx.db.patch).not.toHaveBeenCalled();
});

it("公開mutationも切替同意のない受諾を保存しない", async () => {
  const ctx = setup();
  ctx.auth.getUserIdentity = vi
    .fn()
    .mockResolvedValue(createIdentity("recipient", "recipient@example.test"));
  await expect(acceptGroupInvitationHandler(ctx, { token: recipient.token })).rejects.toThrow(
    "表示するグループの切り替えを確認してください",
  );
  expect(ctx.db.insert).not.toHaveBeenCalled();
  expect(ctx.db.patch).not.toHaveBeenCalled();
});
