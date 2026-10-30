import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../../domain/aiExpenseDrafts/judgmentItemWindow";
import type { UsecaseGroupContext } from "../context";
import { findDraftInGroup } from "./loadDraftInGroup";

/** 下書きと明細を取得する。存在しないか他グループなら null を返す。 */
export async function getAiExpenseDraftWithItems(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    draftItems: AiExpenseDraftItemReadRepository;
  },
  args: { draftId: string },
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] } | null> {
  const fields = await findDraftInGroup(deps.drafts, ctx.groupId, args.draftId);
  if (fields === null) {
    return null;
  }
  const items = await deps.draftItems.listByDraftAsc(
    ctx.groupId,
    args.draftId,
    DRAFT_JUDGMENT_ITEM_LIMIT,
  );
  return { draft: fields, items };
}
