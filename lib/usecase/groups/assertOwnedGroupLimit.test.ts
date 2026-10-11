import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { MAX_OWNED_GROUPS_PER_USER } from "../../domain/groups/groupInvitation";
import {
  assertOwnedGroupLimit,
  OWNED_GROUP_LIMIT_SELF_MESSAGE,
  OWNED_GROUP_LIMIT_TARGET_MESSAGE,
} from "./assertOwnedGroupLimit";

/** listByUserAndRole の bounded read（limit まで）を模す。 */
function depsWith(ownedCount: number) {
  const records = Array.from({ length: ownedCount }, (_, i) => ({
    role: "owner" as const,
    id: `o${i}`,
  }));
  const listByUserAndRole = vi.fn(
    async (_u: string, _r: string, limit?: number) =>
      (limit === undefined ? records : records.slice(0, limit)) as never,
  );
  return { memberships: { listByUserAndRole } };
}

describe("assertOwnedGroupLimit", () => {
  it("上限未満なら通り、owner 行だけを上限件数までの bounded read で読む", async () => {
    const deps = depsWith(MAX_OWNED_GROUPS_PER_USER - 1);
    await expect(assertOwnedGroupLimit(deps, "u", { subject: "target" })).resolves.toBeUndefined();
    expect(deps.memberships.listByUserAndRole).toHaveBeenCalledWith(
      "u",
      "owner",
      MAX_OWNED_GROUPS_PER_USER,
    );
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
