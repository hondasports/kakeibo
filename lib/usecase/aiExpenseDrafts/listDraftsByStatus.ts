import type { AiExpenseDraftStatus } from "../../domain/aiExpenseDrafts/constants";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { PaginatedResult, PaginationOpts } from "../../domain/pagination";
import type { ItemSummary } from "../../domain/aiExpenseDrafts/reviewItems";
import type { UsecaseGroupContext } from "../context";

/** 一覧1回分の下書き件数の上限。明細の判定窓（DRAFT_JUDGMENT_ITEM_LIMIT）とは別概念。 */
const DRAFT_LIST_LIMIT = 100;

export type AiExpenseDraftListEntry = AiExpenseDraftFields & {
  itemSummary?: ItemSummary;
};

type DraftListDeps = {
  drafts: AiExpenseDraftReadRepository;
};

/**
 * ready / needs_review の一覧には保存済み listSummary の itemSummary を付与する。
 * 明細テーブルは読まない。listSummary を持たない下書きは itemSummary を付けずに返す
 * （クライアントでは金額・税内訳が未解決と同じ扱いになる）。
 */
function attachItemSummary(
  status: AiExpenseDraftStatus,
  drafts: AiExpenseDraftFields[],
): AiExpenseDraftListEntry[] {
  if (status !== "ready" && status !== "needs_review") {
    return drafts;
  }
  return drafts.map((draft) => {
    if (draft.listSummary === undefined) {
      return draft;
    }
    return { ...draft, itemSummary: draft.listSummary.itemSummary };
  });
}

/** ステータスで下書き一覧を取得する。ready/needs_review には保存済みの明細サマリを付与する。 */
export async function listAiExpenseDraftsByStatus(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: DraftListDeps,
  args: { status: AiExpenseDraftStatus },
): Promise<AiExpenseDraftListEntry[]> {
  const drafts = await deps.drafts.listByGroupAndStatus(ctx.groupId, args.status, DRAFT_LIST_LIMIT);
  return attachItemSummary(args.status, drafts);
}

/** ステータスで下書き一覧をページング取得する。サマリの付与ルールは一括取得と同じ。 */
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
  return { ...draftsPage, page: attachItemSummary(args.status, draftsPage.page) };
}
