/** 候補として返すカテゴリの最大件数 */
import type { AiExpenseDraftDocumentType } from "../aiExpenseDrafts/constants";

export const CATEGORY_CANDIDATE_MAX = 20;

export type CategoryLike<TId = string> = {
  _id: TId;
  name: string;
};

type DocumentType = AiExpenseDraftDocumentType;

type BuildCategoryCandidatesInput<TId = string> = {
  documentType: DocumentType;
  /** AIが抽出した推定カテゴリ名 */
  categoryName?: string;
  /** レシートの店名 */
  shopName?: string;
  /** コンビニ払込票の支払場所（カテゴリ判定の主軸にしない） */
  paymentPlace?: string;
  /** 支払先（コンビニ払込票で優先） */
  payeeName?: string;
  /** 支払内容（コンビニ払込票で優先） */
  paymentPurpose?: string;
  /** ユーザーのアクティブカテゴリ全件 */
  categories: CategoryLike<TId>[];
};

function matchScore(keyword: string, categoryName: string): number {
  const kw = keyword.trim().toLowerCase();
  const cn = categoryName.trim().toLowerCase();
  if (!kw || !cn) return 0;
  if (cn === kw) return 2;
  if (cn.includes(kw) || kw.includes(cn)) return 1;
  return 0;
}

function rankAndLimit<TId>(
  categories: CategoryLike<TId>[],
  scoreFn: (cat: CategoryLike<TId>) => number,
): CategoryLike<TId>[] {
  const scored = categories.map((cat) => ({ cat, score: scoreFn(cat) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, CATEGORY_CANDIDATE_MAX).map((s) => s.cat);
}

export function buildCategoryCandidates<TId = string>(
  input: BuildCategoryCandidatesInput<TId>,
): CategoryLike<TId>[] {
  const { documentType, categoryName, shopName, payeeName, paymentPurpose, categories } = input;

  if (categories.length === 0) return [];

  const keywords: string[] = [];

  if (categoryName?.trim()) {
    keywords.push(categoryName.trim());
  }

  if (documentType === "convenience_payment") {
    if (paymentPurpose?.trim()) keywords.push(paymentPurpose.trim());
    if (payeeName?.trim()) keywords.push(payeeName.trim());
  } else {
    if (shopName?.trim()) keywords.push(shopName.trim());
    if (payeeName?.trim()) keywords.push(payeeName.trim());
  }

  if (keywords.length === 0) {
    return categories.slice(0, CATEGORY_CANDIDATE_MAX);
  }

  return rankAndLimit(categories, (cat) =>
    keywords.reduce((sum, kw) => sum + matchScore(kw, cat.name), 0),
  );
}

export function resolveCategoryIdFromCandidates<TId>(
  categoryName: string | undefined,
  candidates: CategoryLike<TId>[],
): TId | undefined {
  const target = categoryName?.trim().toLowerCase();
  if (!target) return undefined;
  return candidates.find((cat) => cat.name.toLowerCase() === target)?._id;
}
