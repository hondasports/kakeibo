import { describe, expect, it } from "vitest";
import type { LineAccountLinkRecord, LineLinkRequestRecord } from "./records";
import {
  canFinalizeRequest,
  clampExpirationLimit,
  hasLineLinkConflict,
  planClaimRequest,
} from "./rules";

const request = (overrides: Partial<LineLinkRequestRecord> = {}): LineLinkRequestRecord => ({
  id: "request-1",
  userId: "user-a",
  stateHash: "state",
  nonceHash: "nonce",
  codeVerifier: "verifier",
  status: "pending",
  expiresAt: 200,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const link = (userId: string): LineAccountLinkRecord => ({
  id: `link-${userId}`,
  userId,
  lineUserId: "line-user",
  status: "active",
  linkedAt: 1,
  createdAt: 1,
  updatedAt: 1,
});

describe("planClaimRequest", () => {
  it("所有者のpendingかつ期限内だけclaimする", () => {
    expect(planClaimRequest(request(), "user-a", 100)).toEqual({
      kind: "claim",
      requestId: "request-1",
      nonceHash: "nonce",
      codeVerifier: "verifier",
    });
    expect(planClaimRequest(request(), "user-b", 100)).toEqual({ kind: "invalid" });
    expect(planClaimRequest(request({ status: "claimed" }), "user-a", 100)).toEqual({
      kind: "invalid",
    });
    expect(planClaimRequest(request(), "user-a", 200)).toEqual({ kind: "expired" });
  });
});

describe("finalize rules", () => {
  it("claimed・所有者・nonce・期限を全て満たす場合だけfinalizeする", () => {
    const claimed = request({ status: "claimed" });
    expect(canFinalizeRequest(claimed, "user-a", "nonce", 100)).toBe(true);
    expect(canFinalizeRequest(claimed, "user-b", "nonce", 100)).toBe(false);
    expect(canFinalizeRequest(claimed, "user-a", "wrong", 100)).toBe(false);
    expect(canFinalizeRequest(claimed, "user-a", "nonce", 200)).toBe(false);
  });

  it("同じLINE userの別ユーザーactive linkだけを競合とする", () => {
    expect(hasLineLinkConflict([link("user-a")], "user-a")).toBe(false);
    expect(hasLineLinkConflict([link("user-a"), link("user-b")], "user-a")).toBe(true);
  });
});

describe("clampExpirationLimit", () => {
  it("整数化して1から100へ制限する", () => {
    expect(clampExpirationLimit(0)).toBe(1);
    expect(clampExpirationLimit(12.9)).toBe(12);
    expect(clampExpirationLimit(101)).toBe(100);
  });
});
