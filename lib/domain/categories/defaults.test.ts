import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORIES_SEED_VERSION,
  MAX_CATEGORIES_PER_GROUP,
  shouldRefreshLegacyDefaultCategoryColor,
} from "./defaults";

const SEEDED_DEFINITIONS: Record<
  number,
  readonly { name: string; description: string; color: string; sortOrder: number }[]
> = {
  1: [
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
  ],
};

describe("DEFAULT_CATEGORIES", () => {
  it("定義を変更したらseedバージョンを上げ、対応表に新しい版を追加する", () => {
    expect(
      DEFAULT_CATEGORIES,
      "DEFAULT_CATEGORIES を変更した場合は DEFAULT_CATEGORIES_SEED_VERSION を上げ、SEEDED_DEFINITIONS に新しい版を追加してください。既存版の定義は変更しないでください。",
    ).toEqual(SEEDED_DEFINITIONS[DEFAULT_CATEGORIES_SEED_VERSION]);
  });

  it("デフォルトカテゴリが 8 件あり、sortOrder が 1 から連続している", () => {
    expect(DEFAULT_CATEGORIES.length).toBe(8);
    DEFAULT_CATEGORIES.forEach((category, index) => {
      expect(category.sortOrder).toBe(index + 1);
    });
  });
});

describe("MAX_CATEGORIES_PER_GROUP", () => {
  it("100 である", () => {
    expect(MAX_CATEGORIES_PER_GROUP).toBe(100);
  });
});

describe("shouldRefreshLegacyDefaultCategoryColor", () => {
  it("名前・sortOrder が一致し、color が legacy カラーなら true", () => {
    const existing = { name: "食費", color: "#FF6B6B", sortOrder: 1 };
    expect(shouldRefreshLegacyDefaultCategoryColor(existing, DEFAULT_CATEGORIES[0])).toBe(true);
  });

  it("color が現在のデフォルトと同じなら false", () => {
    const existing = { name: "食費", color: "#8B5E3C", sortOrder: 1 };
    expect(shouldRefreshLegacyDefaultCategoryColor(existing, DEFAULT_CATEGORIES[0])).toBe(false);
  });

  it("名前が異なるなら false", () => {
    const existing = { name: "食品", color: "#FF6B6B", sortOrder: 1 };
    expect(shouldRefreshLegacyDefaultCategoryColor(existing, DEFAULT_CATEGORIES[0])).toBe(false);
  });
});
