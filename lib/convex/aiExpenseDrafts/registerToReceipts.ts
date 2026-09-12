import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { registerReadyDrafts } from "../../usecase/aiExpenseDrafts/registerReadyDrafts";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";

type RegisterReadyDraftsArgs = {
  draftIds: Id<"aiExpenseDrafts">[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/registerReadyDrafts。 */
export async function registerReadyDraftsHandler(ctx: MutationCtx, args: RegisterReadyDraftsArgs) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const result = await registerReadyDrafts(
    { groupId, userId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    registeredDraftIds: result.registeredDraftIds as Id<"aiExpenseDrafts">[],
    registeredReceiptIds: result.registeredReceiptIds as Id<"receipts">[],
    alreadyRegisteredDraftIds: result.alreadyRegisteredDraftIds as Id<"aiExpenseDrafts">[],
  };
}
