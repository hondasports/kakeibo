/**
 * LineActiveGroupResolver の Convex 実装。
 * groups 側の既存 membership カーネル（ポート合成済み）へ委譲する。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import { resolveActiveGroupForUserId } from "../../../convex/groups/membership";
import type { LineActiveGroupResolver } from "../../domain/lineWebhook/activeGroupResolver";

export function createLineActiveGroupResolver(ctx: Pick<QueryCtx, "db">): LineActiveGroupResolver {
  return {
    async resolve(userId) {
      const resolved = await resolveActiveGroupForUserId(ctx, userId);
      if (resolved.status === "resolved") {
        return { status: "resolved", groupId: resolved.membership.groupId };
      }
      return resolved;
    },
  };
}
