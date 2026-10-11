// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { getLineIntegrationMode, getLineLinkFeedback } from "./model";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
});

async function createAndClaimRequest(
  t: ReturnType<typeof convexTest>,
  userId: string,
  options: { stateHash?: string; expiresAt?: number } = {},
) {
  const stateHash = options.stateHash ?? `state-${userId}-${Math.random()}`;
  await t.mutation(internal.lineLink.internal.createRequest, {
    userId,
    stateHash,
    nonceHash: `nonce-${userId}`,
    codeVerifier: "private-verifier",
    expiresAt: options.expiresAt ?? Date.now() + 60_000,
  });
  return {
    stateHash,
    claim: await t.mutation(internal.lineLink.internal.claimRequest, { stateHash, userId }),
  };
}

describe("LINE 連携の公開フィードバック", () => {
  it("内部理由やLINE userIdを含めず、有限の失敗コードだけを返す", () => {
    expect(getLineLinkFeedback("STATE_EXPIRED")).toEqual({
      code: "expired",
      result: "failure",
    });
    expect(getLineLinkFeedback("unexpected internal detail")).toEqual({
      code: "failed",
      result: "failure",
    });
  });

  it("mode未設定とproductionのmockを拒否する", () => {
    const originalMode = process.env.LINE_INTEGRATION_MODE;
    const originalEnv = process.env.APP_ENV;
    try {
      delete process.env.LINE_INTEGRATION_MODE;
      process.env.APP_ENV = "development";
      expect(() => getLineIntegrationMode()).toThrow();
      process.env.LINE_INTEGRATION_MODE = "mock";
      process.env.APP_ENV = "production";
      expect(() => getLineIntegrationMode()).toThrow();
      // APP_ENV未設定・不正値でもmockに落とさない
      delete process.env.APP_ENV;
      expect(() => getLineIntegrationMode()).toThrow(/APP_ENV/);
      process.env.APP_ENV = "prod";
      expect(() => getLineIntegrationMode()).toThrow(/APP_ENV/);
      process.env.APP_ENV = "development";
      expect(getLineIntegrationMode()).toBe("mock");
    } finally {
      if (originalMode === undefined) delete process.env.LINE_INTEGRATION_MODE;
      else process.env.LINE_INTEGRATION_MODE = originalMode;
      if (originalEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = originalEnv;
    }
  });
});

describe("LINE 連携の保存・認可", () => {
  it("状態照会と解除は未認証時に拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(t.query(api.lineLink.queries.getStatus, {})).rejects.toThrow("Not authenticated");
    await expect(t.mutation(api.lineLink.mutations.unlink, {})).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("一回限りのstateをclaimして、成功時だけ連携済み状態を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "user-a";
    const { claim, stateHash } = await createAndClaimRequest(t, userId);
    expect(claim.ok).toBe(true);
    if (!claim.ok) throw new Error("claim should succeed");

    await expect(
      t.mutation(internal.lineLink.internal.finalizeRequest, {
        requestId: claim.requestId,
        userId,
        lineUserId: "line-user-private",
        nonceHash: claim.nonceHash,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      t.withIdentity(identity(userId)).query(api.lineLink.queries.getStatus, {}),
    ).resolves.toEqual({
      status: "linked",
      linkedAt: expect.any(Number),
    });
    const auditRows = await t.run(async (ctx) => ctx.db.query("lineLinkAuditLogs").collect());
    expect(JSON.stringify(auditRows)).not.toContain("line-user-private");
    const requests = await t.run(async (ctx) => ctx.db.query("lineLinkRequests").collect());
    expect(requests[0]?.codeVerifier).toBe("");

    await expect(
      t.mutation(internal.lineLink.internal.claimRequest, {
        stateHash,
        userId,
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("別ユーザーは発行済みstateをclaimできず、正しいユーザーの要求を消費しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const stateHash = "user-a-state";
    const requestId = await t.mutation(internal.lineLink.internal.createRequest, {
      userId: "user-a",
      stateHash,
      nonceHash: "nonce",
      codeVerifier: "private-verifier",
      expiresAt: Date.now() + 60_000,
    });

    await expect(
      t.mutation(internal.lineLink.internal.claimRequest, {
        stateHash,
        userId: "user-b",
      }),
    ).resolves.toEqual({ ok: false, reason: "INVALID_CALLBACK" });

    await expect(
      t.run(async (ctx) => {
        const request = await ctx.db.get(requestId);
        return { status: request?.status, codeVerifier: request?.codeVerifier };
      }),
    ).resolves.toEqual({ status: "pending", codeVerifier: "private-verifier" });
  });

  it("期限切れstateはlinkを作らず、再利用も拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const stateHash = "expired-state";
    await t.mutation(internal.lineLink.internal.createRequest, {
      userId: "user-a",
      stateHash,
      nonceHash: "nonce",
      codeVerifier: "private-verifier",
      expiresAt: Date.now() - 1,
    });
    await expect(
      t.mutation(internal.lineLink.internal.claimRequest, { stateHash, userId: "user-a" }),
    ).resolves.toEqual({ ok: false, reason: "STATE_EXPIRED" });
    await expect(
      t.mutation(internal.lineLink.internal.claimRequest, { stateHash, userId: "user-a" }),
    ).resolves.toEqual({ ok: false, reason: "INVALID_CALLBACK" });
    const links = await t.run(async (ctx) => ctx.db.query("lineAccountLinks").collect());
    expect(links).toHaveLength(0);
    await expect(
      t.mutation(internal.lineLink.internal.expireRequests, { now: Date.now(), limit: 10 }),
    ).resolves.toEqual({ expiredCount: 1 });
    const requests = await t.run(async (ctx) => ctx.db.query("lineLinkRequests").collect());
    expect(requests).toHaveLength(0);
  });

  it("期限後のschedulerはpending requestを自動削除する", async () => {
    const t = convexTest(schema, convexTestModules);
    const requestId = await t.mutation(internal.lineLink.internal.createRequest, {
      userId: "user-a",
      stateHash: "scheduled-expiry-state",
      nonceHash: "nonce",
      codeVerifier: "private-verifier",
      expiresAt: Date.now() - 1,
    });

    await expect(
      t.mutation(internal.lineLink.internal.expireRequest, { requestId }),
    ).resolves.toBeNull();
    const requests = await t.run(async (ctx) => ctx.db.query("lineLinkRequests").collect());
    expect(requests).toHaveLength(0);
  });

  it("期限後のschedulerはclaimed requestも削除してverifierを残さない", async () => {
    const t = convexTest(schema, convexTestModules);
    const requestId = await t.mutation(internal.lineLink.internal.createRequest, {
      userId: "user-a",
      stateHash: "claimed-expiry-state",
      nonceHash: "nonce",
      codeVerifier: "private-verifier",
      expiresAt: Date.now() + 60_000,
    });
    await expect(
      t.mutation(internal.lineLink.internal.claimRequest, {
        stateHash: "claimed-expiry-state",
        userId: "user-a",
      }),
    ).resolves.toMatchObject({ ok: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(requestId, { expiresAt: Date.now() - 1 });
    });

    await expect(
      t.mutation(internal.lineLink.internal.expireRequest, { requestId }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(requestId))).resolves.toBeNull();
  });

  it("nonce不一致はlinkを作らず、verifierをscrubする", async () => {
    const t = convexTest(schema, convexTestModules);
    const { claim } = await createAndClaimRequest(t, "user-a");
    if (!claim.ok) throw new Error("claim should succeed");
    await expect(
      t.mutation(internal.lineLink.internal.finalizeRequest, {
        requestId: claim.requestId,
        userId: "user-a",
        lineUserId: "line-user-private",
        nonceHash: "wrong-nonce-hash",
      }),
    ).resolves.toEqual({ ok: false, reason: "INVALID_CALLBACK" });
    const [request] = await t.run(async (ctx) => ctx.db.query("lineLinkRequests").collect());
    expect(request?.status).toBe("failed");
    expect(request?.codeVerifier).toBe("");
  });

  it("同じLINE userを別ユーザーへ奪取せず、同じユーザーの再連携は旧linkをrevokedにする", async () => {
    const t = convexTest(schema, convexTestModules);
    const { claim: first } = await createAndClaimRequest(t, "user-a");
    if (!first.ok) throw new Error("claim should succeed");
    await t.mutation(internal.lineLink.internal.finalizeRequest, {
      requestId: first.requestId,
      userId: "user-a",
      lineUserId: "line-user-a",
      nonceHash: first.nonceHash,
    });

    const { claim: conflict } = await createAndClaimRequest(t, "user-b");
    if (!conflict.ok) throw new Error("claim should succeed");
    await expect(
      t.mutation(internal.lineLink.internal.finalizeRequest, {
        requestId: conflict.requestId,
        userId: "user-b",
        lineUserId: "line-user-a",
        nonceHash: conflict.nonceHash,
      }),
    ).resolves.toEqual({ ok: false, reason: "LINE_LINK_CONFLICT" });

    const { claim: second } = await createAndClaimRequest(t, "user-a");
    if (!second.ok) throw new Error("claim should succeed");
    await t.mutation(internal.lineLink.internal.finalizeRequest, {
      requestId: second.requestId,
      userId: "user-a",
      lineUserId: "line-user-b",
      nonceHash: second.nonceHash,
    });
    const links = await t.run(async (ctx) => ctx.db.query("lineAccountLinks").collect());
    expect(links.filter((link) => link.status === "active")).toHaveLength(1);
    expect(links.filter((link) => link.status === "revoked")).toHaveLength(1);
  });

  it("解除後は状態照会をunlinkedに戻し、LINE userIdを公開しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "user-a";
    const { claim } = await createAndClaimRequest(t, userId);
    if (!claim.ok) throw new Error("claim should succeed");
    await t.mutation(internal.lineLink.internal.finalizeRequest, {
      requestId: claim.requestId,
      userId,
      lineUserId: "line-user-private",
      nonceHash: claim.nonceHash,
    });
    await expect(
      t.withIdentity(identity(userId)).mutation(api.lineLink.mutations.unlink, {}),
    ).resolves.toEqual({
      status: "unlinked",
    });
    await expect(
      t.withIdentity(identity(userId)).query(api.lineLink.queries.getStatus, {}),
    ).resolves.toEqual({
      status: "unlinked",
    });
  });

  it("active linkが重複しても最新状態を返し、解除で全件をrevokedにする", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-a",
        lineUserId: "line-user-old",
        status: "active",
        linkedAt: 100,
        createdAt: 100,
        updatedAt: 100,
      });
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-a",
        lineUserId: "line-user-new",
        status: "active",
        linkedAt: 200,
        createdAt: 200,
        updatedAt: 200,
      });
    });

    await expect(
      t.withIdentity(identity("user-a")).query(api.lineLink.queries.getStatus, {}),
    ).resolves.toEqual({ status: "linked", linkedAt: 200 });
    await expect(
      t.withIdentity(identity("user-a")).mutation(api.lineLink.mutations.unlink, {}),
    ).resolves.toEqual({ status: "unlinked" });
    const links = await t.run(async (ctx) => ctx.db.query("lineAccountLinks").collect());
    expect(links.every((link) => link.status === "revoked")).toBe(true);
  });

  it("再連携時に同一ユーザーの重複active linkを全件revokedにする", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-a",
        lineUserId: "line-user-old-a",
        status: "active",
        linkedAt: 100,
        createdAt: 100,
        updatedAt: 100,
      });
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-a",
        lineUserId: "line-user-old-b",
        status: "active",
        linkedAt: 200,
        createdAt: 200,
        updatedAt: 200,
      });
    });
    const { claim } = await createAndClaimRequest(t, "user-a");
    if (!claim.ok) throw new Error("claim should succeed");

    await expect(
      t.mutation(internal.lineLink.internal.finalizeRequest, {
        requestId: claim.requestId,
        userId: "user-a",
        lineUserId: "line-user-new",
        nonceHash: claim.nonceHash,
      }),
    ).resolves.toEqual({ ok: true });
    const links = await t.run(async (ctx) => ctx.db.query("lineAccountLinks").collect());
    expect(links.filter((link) => link.status === "active")).toHaveLength(1);
    expect(links.filter((link) => link.status === "revoked")).toHaveLength(2);
  });
});
