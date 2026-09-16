import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import type { UsecaseGroupContext } from "../context";

const LIST_LIMIT = 100;

/** 下書きと明細を取得する。存在しなければ null、他グループなら拒否する。 */
export async function getAiExpenseDraftWithItems(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    draftItems: AiExpenseDraftItemReadRepository;
  },
  args: { draftId: string },
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] } | null> {
  const fields = await deps.drafts.findById(args.draftId);
  if (fields === null) {
    return null;
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  if (!draft.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("AI expense draft does not belong to the current group");
  }
  const items = await deps.draftItems.listByDraftAsc(ctx.groupId, args.draftId, LIST_LIMIT);
  return { draft: fields, items };
}
