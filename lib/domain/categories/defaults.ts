export const DEFAULT_CATEGORIES_SEED_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  {
    name: "食費",
    description: "スーパーや小売店で購入する食品、飲料、菓子など",
    color: "#8B5E3C",
    sortOrder: 1,
  },
  {
    name: "日用品",
    description: "洗剤、化粧品、歯科用品、衛生用品、レジ袋など",
    color: "#A6B28B",
    sortOrder: 2,
  },
  {
    name: "外食",
    description: "飲食店、テイクアウト、デリバリーなどの飲食費",
    color: "#F4A27A",
    sortOrder: 3,
  },
  {
    name: "交通",
    description: "電車、バス、タクシー、ガソリン、高速道路、駐車場など",
    color: "#AAB7C4",
    sortOrder: 4,
  },
  {
    name: "医療",
    description: "医薬品、診察、治療費など。歯科用品は日用品に分類する",
    color: "#C9734B",
    sortOrder: 5,
  },
  {
    name: "娯楽",
    description: "ゲーム、映画、レジャー、書籍、趣味など",
    color: "#6F7F55",
    sortOrder: 6,
  },
  {
    name: "衣服",
    description: "衣類、靴、バッグ、服飾品など",
    color: "#D8B28F",
    sortOrder: 7,
  },
  {
    name: "その他",
    description: "税金、公共料金、たばこ、他カテゴリーに該当しないもの",
    color: "#765F4F",
    sortOrder: 8,
  },
] as const;

export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number];

export const MAX_CATEGORIES_PER_GROUP = 100;

const LEGACY_DEFAULT_CATEGORY_COLORS_BY_SORT_ORDER = new Map<number, string>([
  [1, "#FF6B6B"],
  [2, "#4ECDC4"],
  [3, "#FFE66D"],
  [4, "#95E1D3"],
  [5, "#F38181"],
  [6, "#AA96DA"],
  [7, "#FCBAD3"],
  [8, "#A8DADC"],
]);

export function shouldRefreshLegacyDefaultCategoryColor(
  existing: { name: string; color: string; sortOrder: number },
  nextDefault: DefaultCategory,
): boolean {
  const legacyColor = LEGACY_DEFAULT_CATEGORY_COLORS_BY_SORT_ORDER.get(existing.sortOrder);
  return (
    existing.name === nextDefault.name &&
    existing.sortOrder === nextDefault.sortOrder &&
    existing.color.toUpperCase() === legacyColor
  );
}
