import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { MAX_OWNED_GROUPS_PER_USER } from "../../domain/groups/groupInvitation";
import {
  assertOwnedGroupLimit,
  OWNED_GROUP_LIMIT_SELF_MESSAGE,
  OWNED_GROUP_LIMIT_TARGET_MESSAGE,
  OWNED_GROUPS_SCAN_LIMIT,
} from "./assertOwnedGroupLimit";

function depsWith(ownedCount: number, memberCount = 0) {
  const records = [
    ...Array.from({ length: ownedCount }, (_, i) => ({ role: "owner" as const, id: `o${i}` })),
    ...Array.from({ length: memberCount }, (_, i) => ({ role: "member" as const, id: `m${i}` })),
  ];
  const listByUser = vi.fn(async () => records as never);
  return { memberships: { listByUser } };
}

describe("assertOwnedGroupLimit", () => {
  it("上限未満なら通り、bounded read で走査する", async () => {
    const deps = depsWith(MAX_OWNED_GROUPS_PER_USER - 1, 30);
    await expect(assertOwnedGroupLimit(deps, "u", { subject: "target" })).resolves.toBeUndefined();
    expect(deps.memberships.listByUser).toHaveBeenCalledWith("u", OWNED_GROUPS_SCAN_LIMIT);
  });

  it("上限ちょうどで subject=target なら対象向けメッセージで拒否する", async () => {
    const deps = depsWith(MAX_OWNED_GROUPS_PER_USER);
    const error = await assertOwnedGroupLimit(deps, "u", { subject: "target" }).catch((e) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.data).toBe(OWNED_GROUP_LIMIT_TARGET_MESSAGE);
  });

  it("subject=self なら作成者向けメッセージで拒否する", async () => {
    const deps = depsWith(MAX_OWNED_GROUPS_PER_USER);
    const error = await assertOwnedGroupLimit(deps, "u", { subject: "self" }).catch((e) => e);
    expect(error.data).toBe(OWNED_GROUP_LIMIT_SELF_MESSAGE);
  });
});
