import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import { acceptInvitation, previewInvitation } from "./clerkInvitations";
import { createIdentity } from "./testHelpers";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("../../lib/convex/groups/clerkInvitationLib/inviteActions", () => ({
  getClerkClient: () => ({ users: { getUser } }),
  inviteMemberHandler: vi.fn(),
  cancelPendingGroupInvitationHandler: vi.fn(),
}));

function setup(authenticated = true) {
  const ctx = {
    auth: {
      getUserIdentity: vi
        .fn()
        .mockResolvedValue(
          authenticated ? createIdentity("recipient", "primary@example.test") : null,
        ),
    },
    runQuery: vi.fn().mockResolvedValue({
      groupId: "group-new",
      groupName: "招待先",
      activeGroupId: null,
      activeGroupName: null,
      isExistingMember: false,
    }),
    runMutation: vi.fn().mockResolvedValue("group-new"),
  };
  return { ctx, actionCtx: ctx as unknown as ActionCtx };
}

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({
    emailAddresses: [
      {
        id: "verified",
        emailAddress: " Secondary@Example.Test ",
        verification: { status: "verified" },
      },
      {
        id: "unverified",
        emailAddress: "unverified@example.test",
        verification: { status: "unverified" },
      },
    ],
  });
});

describe("Clerk招待の確認と受諾", () => {
  it("確認actionは検証済みメールを照会に使い、mutationを呼ばない", async () => {
    const { ctx, actionCtx } = setup();
    await expect(
      previewInvitation._handler(actionCtx, { token: "invite-token" }),
    ).resolves.toMatchObject({ groupName: "招待先" });
    expect(getUser).toHaveBeenCalledWith("recipient");
    expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(), {
      token: "invite-token",
      acceptedUserId: "recipient",
      acceptedEmails: ["primary@example.test", "secondary@example.test"],
    });
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it.each([previewInvitation, acceptInvitation])("未認証のactionを拒否する", async (action) => {
    const { ctx, actionCtx } = setup(false);
    await expect(action._handler(actionCtx, { token: "invite-token" })).rejects.toThrow(
      "Not authenticated",
    );
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("受諾actionは認証主体・検証済みメールと切替同意をmutationへ渡す", async () => {
    const { ctx, actionCtx } = setup();
    await acceptInvitation._handler(actionCtx, {
      token: "invite-token",
      switchActiveGroup: true,
      expectedActiveGroupId: "group-old" as import("../_generated/dataModel").Id<"groups">,
    });
    const [reference, args] = ctx.runMutation.mock.calls[1];
    expect(getFunctionName(reference)).toBe(
      "groups/invitations:acceptGroupInvitationForVerifiedEmails",
    );
    expect(args).toEqual({
      token: "invite-token",
      switchActiveGroup: true,
      expectedActiveGroupId: "group-old",
      acceptedUserId: "recipient",
      acceptedEmails: ["primary@example.test", "secondary@example.test"],
    });
  });

  it.each([
    {
      label: "大文字と前後の空白",
      email: "  Recipient@Example.Test  ",
      emails: ["recipient@example.test"],
      profileEmail: "recipient@example.test",
    },
    { label: "空文字", email: "", emails: [], profileEmail: undefined },
    { label: "空白のみ", email: "   ", emails: [""], profileEmail: undefined },
    { label: "未設定", email: undefined, emails: [], profileEmail: undefined },
  ])(
    "$label: identityメールの候補とプロフィールを維持する",
    async ({ email, emails, profileEmail }) => {
      const { ctx, actionCtx } = setup();
      const { email: _email, ...identity } = createIdentity("recipient");
      ctx.auth.getUserIdentity.mockResolvedValue({
        ...identity,
        name: "招待先",
        ...(email === undefined ? {} : { email }),
      });
      getUser.mockResolvedValue({ username: "招待先", emailAddresses: [] });

      await acceptInvitation._handler(actionCtx, { token: "invite-token" });

      expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe(
        "users/internal:upsertUserProfile",
      );
      expect(ctx.runMutation.mock.calls[0][1]).toEqual({
        userId: "recipient",
        displayName: "招待先",
        ...(profileEmail === undefined ? {} : { email: profileEmail }),
      });
      expect(getFunctionName(ctx.runMutation.mock.calls[1][0])).toBe(
        "groups/invitations:acceptGroupInvitationForVerifiedEmails",
      );
      expect(ctx.runMutation.mock.calls[1][1]).toEqual({
        token: "invite-token",
        acceptedUserId: "recipient",
        acceptedEmails: emails,
      });
    },
  );
});

it("Clerk照会失敗時も既存のidentityメールへのフォールバックを維持し、確認では保存しない", async () => {
  getUser.mockRejectedValue(new Error("Clerk unavailable"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { ctx, actionCtx } = setup();
  try {
    await previewInvitation._handler(actionCtx, { token: "invite-token" });
    expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(), {
      token: "invite-token",
      acceptedUserId: "recipient",
      acceptedEmails: ["primary@example.test"],
    });
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.any(String), "Error");
  } finally {
    warn.mockRestore();
  }
});
