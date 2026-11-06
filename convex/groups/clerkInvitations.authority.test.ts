// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { inviteMemberHandler } from "../../lib/convex/groups/clerkInvitationLib/inviteActions";

const owner = "https://issuer.example|owner";
const recipient = "https://issuer.example|recipient";
const token = "authority-race-token";
const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: userId,
  issuer: "https://issuer.example",
  email: userId === recipient ? "recipient@example.com" : "owner@example.com",
});

async function setup() {
  const t = convexTest(schema, convexTestModules);
  const ids = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", { name: "A", createdAt: 1, updatedAt: 1 });
    const memberId = await ctx.db.insert("groupMembers", {
      groupId,
      userId: owner,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: "other-owner",
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: owner,
      displayName: "owner",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, memberId };
  });
  const authed = t.withIdentity(identity(owner));
  const record = {
    groupId: ids.groupId,
    invitedByUserId: owner,
    email: "recipient@example.com",
    token,
  };
  const revokeInvitation = vi.fn(async (_id: string) => undefined);
  const listInvitations = () => t.run((ctx) => ctx.db.query("groupInvitations").collect());
  return { t, authed, ...ids, record, revokeInvitation, listInvitations };
}

describe("招待の予約・確定の認可", () => {
  beforeEach(() => vi.stubEnv("APP_ENV", "development"));
  afterEach(() => vi.unstubAllEnvs());
  it.each(["demote", "remove", "deleting", "missing"] as const)(
    "予約前の %s はClerk送信前に拒否する",
    async (change) => {
      const s = await setup();
      const createInvitation = vi.fn(async () => ({ id: "clerk-invite" }));
      const ctx: Pick<ActionCtx, "runQuery" | "runMutation"> = {
        runQuery: s.authed.query,
        runMutation: async (fn, args) => {
          await s.t.run(async (dbCtx) => {
            if (change === "demote") await dbCtx.db.patch(s.memberId, { role: "member" });
            if (change === "remove") await dbCtx.db.delete(s.memberId);
            if (change === "deleting") await dbCtx.db.patch(s.groupId, { status: "deleting" });
            if (change === "missing") await dbCtx.db.delete(s.groupId);
          });
          return s.authed.mutation(fn, args);
        },
      };
      await expect(
        inviteMemberHandler(
          ctx,
          {
            email: s.record.email,
            redirectUrl: "http://localhost:5173/group/invitations/accept",
          },
          {
            createToken: () => token,
            getClerkClient: () => ({
              invitations: { createInvitation, revokeInvitation: s.revokeInvitation },
            }),
          },
        ),
      ).rejects.toThrow();
      expect(createInvitation).not.toHaveBeenCalled();
      expect(await s.listInvitations()).toEqual([]);
    },
  );

  it("未認証・actor偽装では予約できない", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(internal.groups.invitations.createGroupInvitationRecord, s.record),
    ).rejects.toThrow();
    await expect(
      s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
        ...s.record,
        invitedByUserId: "other-owner",
      }),
    ).rejects.toThrow();
    expect(await s.listInvitations()).toEqual([]);
  });

  it.each([false, true])(
    "Clerk送信中に降格したら確定を拒否し予約を除去する（revoke失敗=%s）",
    async (revokeFails) => {
      const s = await setup();
      if (revokeFails) s.revokeInvitation.mockRejectedValue(new Error("provider unavailable"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const createInvitation = vi.fn(async () => {
        await s.t.run((ctx) => ctx.db.patch(s.memberId, { role: "member" }));
        return { id: "clerk-invite" };
      });
      try {
        await expect(
          inviteMemberHandler(
            { runQuery: s.authed.query, runMutation: s.authed.mutation },
            {
              email: s.record.email,
              redirectUrl: "http://localhost:5173/group/invitations/accept",
            },
            {
              createToken: () => token,
              getClerkClient: () => ({
                invitations: { createInvitation, revokeInvitation: s.revokeInvitation },
              }),
            },
          ),
        ).rejects.toThrow();
        expect(await s.listInvitations()).toEqual([]);
        expect(s.revokeInvitation).toHaveBeenCalledWith("clerk-invite");
        await expect(
          s.t
            .withIdentity(identity(recipient))
            .mutation(api.groups.invitations.acceptGroupInvitation, { token }),
        ).rejects.toThrow();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it("予約中は受諾できず、正常確定後に受諾できる", async () => {
    const s = await setup();
    await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, s.record);
    const receiver = s.t.withIdentity(identity(recipient));
    await expect(
      receiver.mutation(api.groups.invitations.acceptGroupInvitation, { token }),
    ).rejects.toThrow();
    await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
      ...s.record,
      clerkInvitationId: "clerk-invite",
    });
    await expect(
      receiver.mutation(api.groups.invitations.acceptGroupInvitation, { token }),
    ).resolves.toBe(s.groupId);
  });

  it("active group が切り替わっても開始時の対象に owner として確定する", async () => {
    const s = await setup();
    await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, s.record);
    await s.t.run(async (ctx) => {
      const groupB = await ctx.db.insert("groups", { name: "B", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("groupMembers", {
        groupId: groupB,
        userId: owner,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", owner))
        .unique();
      await ctx.db.patch(user!._id, { activeGroupId: groupB });
    });
    await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
      ...s.record,
      clerkInvitationId: "clerk-invite",
    });
    expect(await s.listInvitations()).toEqual([
      expect.objectContaining({ groupId: s.groupId, deliveryPending: false }),
    ]);
  });

  it.each(["remove", "deleting", "missing"] as const)(
    "予約後の %s は確定を拒否し受諾を許可しない",
    async (change) => {
      const s = await setup();
      await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, s.record);
      await s.t.run(async (ctx) => {
        if (change === "remove") await ctx.db.delete(s.memberId);
        if (change === "deleting") await ctx.db.patch(s.groupId, { status: "deleting" });
        if (change === "missing") await ctx.db.delete(s.groupId);
      });
      await expect(
        s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
          ...s.record,
          clerkInvitationId: "clerk-invite",
        }),
      ).rejects.toThrow();
      expect(await s.listInvitations()).toEqual([
        expect.objectContaining({ deliveryPending: true }),
      ]);
      await expect(
        s.t
          .withIdentity(identity(recipient))
          .mutation(api.groups.invitations.acceptGroupInvitation, { token }),
      ).rejects.toThrow();
    },
  );

  it("確定がcommit済みでも応答を失った場合は対象のpending招待を補償削除する", async () => {
    const s = await setup();
    let mutations = 0;
    const responseError = new Error("response lost");
    const ctx: Pick<ActionCtx, "runQuery" | "runMutation"> = {
      runQuery: s.authed.query,
      runMutation: async (fn, args) => {
        const result = await s.authed.mutation(fn, args);
        if (++mutations === 2) throw responseError;
        return result;
      },
    };
    await expect(
      inviteMemberHandler(
        ctx,
        {
          email: s.record.email,
          redirectUrl: "http://localhost:5173/group/invitations/accept",
        },
        {
          createToken: () => token,
          getClerkClient: () => ({
            invitations: {
              createInvitation: async () => ({ id: "clerk-invite" }),
              revokeInvitation: s.revokeInvitation,
            },
          }),
        },
      ),
    ).rejects.toBe(responseError);
    expect(await s.listInvitations()).toEqual([]);
    expect(s.revokeInvitation).toHaveBeenCalledWith("clerk-invite");
  });

  it("確定拒否後にDB補償とClerk取消が失敗しても予約は受諾できず元エラーを返す", async () => {
    const s = await setup();
    const cleanupError = new Error("private cleanup details");
    s.revokeInvitation.mockRejectedValue(new TypeError("private provider details"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let mutations = 0;
    let authorizationError: unknown;
    const ctx: Pick<ActionCtx, "runQuery" | "runMutation"> = {
      runQuery: s.authed.query,
      runMutation: async (fn, args) => {
        if (++mutations === 3) throw cleanupError;
        try {
          return await s.authed.mutation(fn, args);
        } catch (error) {
          authorizationError = error;
          throw error;
        }
      },
    };
    try {
      await expect(
        inviteMemberHandler(
          ctx,
          {
            email: s.record.email,
            redirectUrl: "http://localhost:5173/group/invitations/accept",
          },
          {
            createToken: () => token,
            getClerkClient: () => ({
              invitations: {
                createInvitation: async () => {
                  await s.t.run((dbCtx) => dbCtx.db.patch(s.memberId, { role: "member" }));
                  return { id: "clerk-invite" };
                },
                revokeInvitation: s.revokeInvitation,
              },
            }),
          },
        ),
      ).rejects.toThrow("グループオーナーのみ実行できます");
      expect(authorizationError).toBeDefined();
      expect(await s.listInvitations()).toEqual([
        expect.objectContaining({ deliveryPending: true }),
      ]);
      await expect(
        s.t
          .withIdentity(identity(recipient))
          .mutation(api.groups.invitations.acceptGroupInvitation, { token }),
      ).rejects.toThrow();
      expect(warn.mock.calls).toEqual([
        ["[groups.clerkInvitations.inviteMember] failed to clean up reserved invitation", "Error"],
        ["[groups.clerkInvitations.inviteMember] failed to revoke Clerk invitation", "TypeError"],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("補償削除は別のClerk IDと承諾済み招待を削除しない", async () => {
    const s = await setup();
    await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
      ...s.record,
      clerkInvitationId: "clerk-invite",
    });
    const cleanup = internal.groups.invitations.deletePendingGroupInvitationRecordByToken;
    await expect(
      s.authed.mutation(cleanup, { token, clerkInvitationId: "other" }),
    ).resolves.toBeNull();
    await s.t
      .withIdentity(identity(recipient))
      .mutation(api.groups.invitations.acceptGroupInvitation, { token });
    await expect(
      s.authed.mutation(cleanup, { token, clerkInvitationId: "clerk-invite" }),
    ).resolves.toBeNull();
    expect(await s.listInvitations()).toEqual([expect.objectContaining({ status: "accepted" })]);
  });

  it.each(["email", "group"] as const)(
    "予約と異なる %s を持つ確定引数は拒否する",
    async (change) => {
      const s = await setup();
      await s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, s.record);
      const otherGroupId = await s.t.run(async (ctx) => {
        const id = await ctx.db.insert("groups", { name: "B", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("groupMembers", {
          groupId: id,
          userId: owner,
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        });
        return id;
      });
      await expect(
        s.authed.mutation(internal.groups.invitations.createGroupInvitationRecord, {
          ...s.record,
          ...(change === "email" ? { email: "other@example.com" } : { groupId: otherGroupId }),
          clerkInvitationId: "clerk-invite",
        }),
      ).rejects.toThrow("無効になりました");
      expect(await s.listInvitations()).toEqual([
        expect.objectContaining({
          groupId: s.groupId,
          email: s.record.email,
          deliveryPending: true,
        }),
      ]);
    },
  );

  it("旧形式の確定済み招待は引き続き受諾できる", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.insert("groupInvitations", {
        ...s.record,
        status: "pending",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(
      s.t
        .withIdentity(identity(recipient))
        .mutation(api.groups.invitations.acceptGroupInvitation, { token }),
    ).resolves.toBe(s.groupId);
  });
});
