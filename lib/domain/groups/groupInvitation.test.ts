import { describe, expect, it } from "vitest";
import { assessGroupInvitationStaleness } from "./groupInvitation";

describe("assessGroupInvitationStaleness", () => {
  it("pending は stale", () => {
    expect(assessGroupInvitationStaleness({ status: "pending" })).toBe("stale");
  });

  it("revoked / expired は keep", () => {
    expect(assessGroupInvitationStaleness({ status: "revoked" })).toBe("keep");
    expect(assessGroupInvitationStaleness({ status: "expired" })).toBe("keep");
  });

  it("accepted で acceptedByUserId が無ければ stale", () => {
    expect(assessGroupInvitationStaleness({ status: "accepted" })).toBe("stale");
  });

  it("accepted で acceptedByUserId があれば membership 確認が必要", () => {
    expect(assessGroupInvitationStaleness({ status: "accepted", acceptedByUserId: "u1" })).toBe(
      "check_membership",
    );
  });
});
