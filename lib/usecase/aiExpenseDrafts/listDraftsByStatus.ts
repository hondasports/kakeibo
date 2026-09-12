import type { AiExpenseDraftStatus } from "../../domain/aiExpenseDrafts/constants";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import { summarizeItems, type ItemSummary } from "../../domain/aiExpenseDrafts/reviewItems";
import type { UsecaseGroupContext } from "../context";

const LIST_LIMIT = 100;

export type AiExpenseDraftListEntry = AiExpenseDraftFields & { itemSummary?: ItemSummary };

/** ステータスで下書き一覧を取得する。ready/needs_review には明細サマリを付与する。 */
export async function listAiExpenseDraftsByStatus(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    draftItems: AiExpenseDraftItemReadRepository;
  },
  args: { status: AiExpenseDraftStatus },
): Promise<AiExpenseDraftListEntry[]> {
  const drafts = await deps.drafts.listByGroupAndStatus(ctx.groupId, args.status, LIST_LIMIT);
  if (args.status !== "ready" && args.status !== "needs_review") {
    return drafts;
  }
  return await Promise.all(
    drafts.map(async (draft) => {
      const items = await deps.draftItems.listByDraftAsc(ctx.groupId, draft.id!, LIST_LIMIT);
      return {
        ...draft,
        itemSummary: summarizeItems(draft, items),
      };
    }),
  );
}
