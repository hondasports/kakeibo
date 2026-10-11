import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  buildClerkInvitationParams,
  buildInvitationRedirectUrl,
  cancelPendingGroupInvitationHandler,
  getClerkUserDisplayName,
  getPrimaryVerifiedClerkEmailAddress,
  getVerifiedClerkEmailAddresses,
  inviteMemberHandler,
} from "./clerkInvitations";

describe("buildInvitationRedirectUrl", () => {
  it("本番ドメインの招待受け入れURLを許可する", () => {
    expect(
      buildInvitationRedirectUrl(
        "https://kakeibo.vercel.app/group/invitations/accept",
        "token-123",
      ),
    ).toBe("https://kakeibo.vercel.app/group/invitations/accept?token=token-123");
  });

  it("攻撃者が登録した kakeibo-*.vercel.app は拒否する", () => {
    expect(() =>
      buildInvitationRedirectUrl(
        "https://kakeibo-attacker.vercel.app/group/invitations/accept",
        "token-456",
      ),
    ).toThrowError(ConvexError);
  });

  it("INVITATION_REDIRECT_ORIGINS に設定した origin を許可する", () => {
    vi.stubEnv("INVITATION_REDIRECT_ORIGINS", "https://preview.suzumemo.jp");
    try {
      expect(
        buildInvitationRedirectUrl(
          "https://preview.suzumemo.jp/group/invitations/accept",
          "token-456",
        ),
      ).toBe("https://preview.suzumemo.jp/group/invitations/accept?token=token-456");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["development", true],
    ["production", false],
    ["preview", false],
    ["", false],
  ])("APP_ENV=%s のとき localhost の許可は %s", (appEnv, allowed) => {
    vi.stubEnv("APP_ENV", appEnv);
    try {
      const call = () =>
        buildInvitationRedirectUrl("http://localhost:5173/group/invitations/accept", "t");
      if (allowed) {
        expect(call()).toBe("http://localhost:5173/group/invitations/accept?token=t");
      } else {
        expect(call).toThrowError(ConvexError);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("APP_ENV 未設定のとき localhost は拒否する", () => {
    vi.stubEnv("APP_ENV", undefined as unknown as string);
    try {
      expect(() =>
        buildInvitationRedirectUrl("http://localhost:5173/group/invitations/accept", "t"),
      ).toThrowError(ConvexError);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("許可されていない origin は拒否する", () => {
    expect(() =>
      buildInvitationRedirectUrl("https://example.com/group/invitations/accept", "token-789"),
    ).toThrowError(ConvexError);
  });
});

describe("buildClerkInvitationParams", () => {
  it("既存招待または既存ユーザーでも再招待できるよう ignoreExisting を有効にする", () => {
    expect(
      buildClerkInvitationParams(
        "invitee@example.com",
        "https://kakeibo.vercel.app/group/invitations/accept?token=token-123",
        "group-001" as Id<"groups">,
        "token-123",
      ),
    ).toEqual({
      emailAddress: "invitee@example.com",
      redirectUrl: "https://kakeibo.vercel.app/group/invitations/accept?token=token-123",
      ignoreExisting: true,
      publicMetadata: {
        groupId: "group-001",
        token: "token-123",
      },
    });
  });
});

describe("getVerifiedClerkEmailAddresses", () => {
  it("Clerkユーザーの verified なメールだけを正規化して返す", () => {
    expect(
      getVerifiedClerkEmailAddresses({
        emailAddresses: [
          {
            id: "email-primary",
            emailAddress: " Primary@Example.com ",
            verification: { status: "verified" },
          },
          {
            id: "email-unverified",
            emailAddress: "unverified@example.com",
            verification: { status: "unverified" },
          },
          {
            id: "email-missing-verification",
            emailAddress: "missing-verification@example.com",
            verification: null,
          },
        ],
      }),
    ).toEqual(["primary@example.com"]);
  });

  it("verified な primary email をプロフィール表示用メールとして返す", () => {
    expect(
      getPrimaryVerifiedClerkEmailAddress({
        primaryEmailAddressId: "email-primary",
        emailAddresses: [
          {
            id: "email-secondary",
            emailAddress: "secondary@example.com",
            verification: { status: "verified" },
          },
          {
            id: "email-primary",
            emailAddress: "Primary@Example.com",
            verification: { status: "verified" },
          },
        ],
      }),
    ).toBe("primary@example.com");
  });

  it("username があれば表示名として優先し、なければ氏名を結合する", () => {
    expect(
      getClerkUserDisplayName(
        {
          username: "friendly-user",
          firstName: "Taro",
          lastName: "Yamada",
        },
        "fallback@example.com",
      ),
    ).toBe("friendly-user");
    expect(
      getClerkUserDisplayName(
        {
          firstName: "Taro",
          lastName: "Yamada",
        },
        "fallback@example.com",
      ),
    ).toBe("Taro Yamada");
    expect(getClerkUserDisplayName({}, "fallback@example.com")).toBe("fallback@example.com");
  });
});

describe("inviteMemberHandler", () => {
  // localhost の戻り先は APP_ENV=development のときだけ許可される
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ローカル予約の作成に失敗したら Clerk invitation 作成へ進まない", async () => {
    const getClerkClient = vi.fn();
    const createToken = vi.fn(() => "invite-token");
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
          clerkOrganizationId: null,
          role: "owner",
          createdAt: 1000,
        })
        .mockResolvedValueOnce("https://issuer.example|owner"),
      runMutation: vi
        .fn()
        .mockRejectedValueOnce(new ConvexError("このユーザーはすでにグループに参加しています")),
    };

    await expect(
      inviteMemberHandler(
        ctx,
        {
          email: "member@example.com",
          redirectUrl: "http://localhost:5173/group/invitations/accept",
        },
        { createToken, getClerkClient },
      ),
    ).rejects.toThrow("このユーザーはすでにグループに参加しています");

    expect(createToken).toHaveBeenCalled();
    expect(getClerkClient).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    expect(ctx.runMutation.mock.calls[0]?.[1]).toEqual({
      groupId: "group-001",
      email: "member@example.com",
      token: "invite-token",
      invitedByUserId: "https://issuer.example|owner",
    });
  });

  it("ローカル予約を作ってから Clerk invitation を作成し、成功後に clerkInvitationId を追記する", async () => {
    const createInvitation = vi.fn().mockResolvedValue({ id: "clerk-invite-001" });
    const getClerkClient = vi.fn(() => ({
      invitations: { createInvitation },
    }));
    const createToken = vi.fn(() => "invite-token");
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
          clerkOrganizationId: null,
          role: "owner",
          createdAt: 1000,
        })
        .mockResolvedValueOnce("https://issuer.example|owner"),
      runMutation: vi.fn().mockResolvedValue("invite-001"),
    };

    await expect(
      inviteMemberHandler(
        ctx,
        {
          email: " Member@Example.com ",
          redirectUrl: "http://localhost:5173/group/invitations/accept",
        },
        { createToken, getClerkClient },
      ),
    ).resolves.toEqual({
      token: "invite-token",
      clerkInvitationId: "clerk-invite-001",
      clerkOrganizationId: null,
    });

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    expect(ctx.runMutation.mock.calls[0]?.[1]).toEqual({
      groupId: "group-001",
      email: "member@example.com",
      token: "invite-token",
      invitedByUserId: "https://issuer.example|owner",
    });
    expect(createInvitation).toHaveBeenCalledWith({
      emailAddress: "member@example.com",
      redirectUrl: "http://localhost:5173/group/invitations/accept?token=invite-token",
      ignoreExisting: true,
      publicMetadata: {
        groupId: "group-001",
        token: "invite-token",
      },
    });
    expect(ctx.runMutation.mock.calls[1]?.[1]).toEqual({
      groupId: "group-001",
      email: "member@example.com",
      token: "invite-token",
      invitedByUserId: "https://issuer.example|owner",
      clerkInvitationId: "clerk-invite-001",
    });
    expect(ctx.runMutation.mock.invocationCallOrder[0]).toBeLessThan(
      createInvitation.mock.invocationCallOrder[0] ?? 0,
    );
    expect(createInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.runMutation.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("member ロールの呼び出しを拒否する", async () => {
    const getClerkClient = vi.fn();
    const createToken = vi.fn();
    const ctx = {
      runQuery: vi.fn().mockResolvedValueOnce({
        _id: "group-001" as Id<"groups">,
        name: "佐藤家",
        clerkOrganizationId: null,
        role: "member",
        createdAt: 1000,
      }),
      runMutation: vi.fn(),
    };

    await expect(
      inviteMemberHandler(
        ctx,
        {
          email: "member@example.com",
          redirectUrl: "http://localhost:5173/group/invitations/accept",
        },
        { createToken, getClerkClient },
      ),
    ).rejects.toThrow("グループオーナーのみ実行できます");

    expect(createToken).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(getClerkClient).not.toHaveBeenCalled();
  });

  it("Clerk invitation 作成に失敗したらローカル予約を削除する", async () => {
    const createInvitation = vi.fn().mockRejectedValue(new Error("Clerk unavailable"));
    const getClerkClient = vi.fn(() => ({
      invitations: { createInvitation },
    }));
    const createToken = vi.fn(() => "invite-token");
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce({
          _id: "group-001" as Id<"groups">,
          name: "佐藤家",
          clerkOrganizationId: null,
          role: "owner",
          createdAt: 1000,
        })
        .mockResolvedValueOnce("https://issuer.example|owner"),
      runMutation: vi.fn().mockResolvedValueOnce("invite-001").mockResolvedValueOnce("invite-001"),
    };

    await expect(
      inviteMemberHandler(
        ctx,
        {
          email: "member@example.com",
          redirectUrl: "http://localhost:5173/group/invitations/accept",
        },
        { createToken, getClerkClient },
      ),
    ).rejects.toThrow("Clerk unavailable");

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    expect(ctx.runMutation.mock.calls[1]?.[1]).toEqual({ token: "invite-token" });
  });
});

describe("cancelPendingGroupInvitationHandler", () => {
  it("Convex で取り消したあと Clerk invitation を revoke する", async () => {
    const revokeInvitation = vi.fn().mockResolvedValue(undefined);
    const getClerkClient = vi.fn(() => ({
      invitations: { revokeInvitation },
    }));
    const ctx = {
      runQuery: vi.fn().mockResolvedValueOnce({
        _id: "group-001" as Id<"groups">,
        name: "佐藤家",
        clerkOrganizationId: null,
        role: "owner",
        createdAt: 1000,
      }),
      runMutation: vi.fn().mockResolvedValue({
        clerkInvitationIds: ["clerk-old", "clerk-new"],
      }),
    };

    await expect(
      cancelPendingGroupInvitationHandler(
        ctx,
        { invitationId: "invite-new" as Id<"groupInvitations"> },
        { getClerkClient },
      ),
    ).resolves.toBeNull();

    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      invitationId: "invite-new",
    });
    expect(revokeInvitation).toHaveBeenCalledTimes(2);
    expect(revokeInvitation).toHaveBeenCalledWith("clerk-old");
    expect(revokeInvitation).toHaveBeenCalledWith("clerk-new");
  });

  it("member ロールの呼び出しを拒否する", async () => {
    const getClerkClient = vi.fn();
    const ctx = {
      runQuery: vi.fn().mockResolvedValueOnce({
        _id: "group-001" as Id<"groups">,
        name: "佐藤家",
        clerkOrganizationId: null,
        role: "member",
        createdAt: 1000,
      }),
      runMutation: vi.fn(),
    };

    await expect(
      cancelPendingGroupInvitationHandler(
        ctx,
        { invitationId: "invite-001" as Id<"groupInvitations"> },
        { getClerkClient },
      ),
    ).rejects.toThrow("グループオーナーのみ実行できます");

    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(getClerkClient).not.toHaveBeenCalled();
  });

  it("Clerk revoke に失敗しても Convex 取り消しは成功として扱う", async () => {
    const revokeInvitation = vi.fn().mockRejectedValue(new Error("Clerk unavailable"));
    const getClerkClient = vi.fn(() => ({
      invitations: { revokeInvitation },
    }));
    const ctx = {
      runQuery: vi.fn().mockResolvedValueOnce({
        _id: "group-001" as Id<"groups">,
        name: "佐藤家",
        clerkOrganizationId: null,
        role: "owner",
        createdAt: 1000,
      }),
      runMutation: vi.fn().mockResolvedValue({
        clerkInvitationIds: ["clerk-old"],
      }),
    };

    await expect(
      cancelPendingGroupInvitationHandler(
        ctx,
        { invitationId: "invite-old" as Id<"groupInvitations"> },
        { getClerkClient },
      ),
    ).resolves.toBeNull();

    expect(revokeInvitation).toHaveBeenCalledWith("clerk-old");
  });
});
