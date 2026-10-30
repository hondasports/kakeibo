import { AiExpenseDraft } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";
import { findDraftInGroup } from "./loadDraftInGroup";

/** AI 下書きを明細ごと削除する。registered は削除不可。存在しない場合は deleted:false を返す。 */
export async function deleteAiExpenseDraft(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: Pick<AiExpenseDraftDeps, "drafts" | "draftItems">,
  args: { draftId: string },
): Promise<{ deleted: boolean }> {
  const fields = await findDraftInGroup(deps.drafts, ctx.groupId, args.draftId);
  if (fields === null) {
    return { deleted: false };
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  try {
    draft.assertDeletableFromQueue();
  } catch (err) {
    throw toConvexError(err);
  }

  const items = await deps.draftItems.listAllByDraft(ctx.groupId, args.draftId);
  await Promise.all(items.map((item) => deps.draftItems.delete(item.id!)));
  await deps.drafts.delete(args.draftId);
  return { deleted: true };
}
