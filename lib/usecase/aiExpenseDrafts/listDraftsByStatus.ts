import type { AiExpenseDraftStatus } from "../../domain/aiExpenseDrafts/constants";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftItemReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import type { PaginatedResult, PaginationOpts } from "../../domain/pagination";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../../domain/aiExpenseDrafts/judgmentItemWindow";
import { summarizeItems, type ItemSummary } from "../../domain/aiExpenseDrafts/reviewItems";
import type { UsecaseGroupContext } from "../context";

/** 一覧1回分の下書き件数の上限。明細の判定窓（DRAFT_JUDGMENT_ITEM_LIMIT）とは別概念。 */
const DRAFT_LIST_LIMIT = 100;

export type AiExpenseDraftListEntry = AiExpenseDraftFields & {
  itemSummary?: ItemSummary;
  /** 一覧の確認理由を下書き確認と同じ判定で導出するための明細。ready/needs_review のみ。 */
  items?: AiExpenseDraftItemFields[];
};

type DraftListDeps = {
  drafts: AiExpenseDraftReadRepository;
  draftItems: AiExpenseDraftItemReadRepository;
};

async function attachItemDetails(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: DraftListDeps,
  status: AiExpenseDraftStatus,
  drafts: AiExpenseDraftFields[],
): Promise<AiExpenseDraftListEntry[]> {
  if (status !== "ready" && status !== "needs_review") {
    return drafts;
  }
  return await Promise.all(
    drafts.map(async (draft) => {
      // 保存済みサマリがある下書きは明細を読まない。
      // 無い旧データのみ従来どおり明細を読む（フォールバック。Phase 3 で外す）。
      if (draft.listSummary !== undefined) {
        return { ...draft, itemSummary: draft.listSummary.itemSummary };
      }
      const items = await deps.draftItems.listByDraftAsc(
        ctx.groupId,
        draft.id!,
        DRAFT_JUDGMENT_ITEM_LIMIT,
      );
      return {
        ...draft,
        itemSummary: summarizeItems(draft, items),
        items: items.length > 0 ? items : undefined,
      };
    }),
  );
}

/** ステータスで下書き一覧を取得する。ready/needs_review には明細サマリと明細を付与する。 */
export async function listAiExpenseDraftsByStatus(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: DraftListDeps,
  args: { status: AiExpenseDraftStatus },
): Promise<AiExpenseDraftListEntry[]> {
  const drafts = await deps.drafts.listByGroupAndStatus(ctx.groupId, args.status, DRAFT_LIST_LIMIT);
  return await attachItemDetails(ctx, deps, args.status, drafts);
}

/** ステータスで下書き一覧をページング取得する。明細の付与ルールは一括取得と同じ。 */
export async function listAiExpenseDraftsByStatusPaginated(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: DraftListDeps,
  args: { status: AiExpenseDraftStatus; paginationOpts: PaginationOpts },
): Promise<PaginatedResult<AiExpenseDraftListEntry>> {
  const draftsPage = await deps.drafts.paginateByGroupAndStatus(
    ctx.groupId,
    args.status,
    args.paginationOpts,
  );
  const page = await attachItemDetails(ctx, deps, args.status, draftsPage.page);
  return { ...draftsPage, page };
}
