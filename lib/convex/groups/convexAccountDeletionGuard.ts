/**
 * AccountDeletionGuard の Convex 実装。
 * accountDeletion ドメインの既存ガードへ委譲する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { AccountDeletionGuard } from "../../domain/groups/groupServices";
import { assertAccountDeletionNotInProgress } from "../../../convex/accountDeletion";

export function createAccountDeletionGuard(ctx: Pick<MutationCtx, "db">): AccountDeletionGuard {
  return {
    async assertNotInProgress(userId) {
      await assertAccountDeletionNotInProgress(ctx, userId);
    },
  };
}
