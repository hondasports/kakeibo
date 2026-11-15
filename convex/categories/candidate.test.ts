import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  CATEGORY_CANDIDATE_MAX,
  buildCategoryCandidates,
  resolveCategoryIdFromCandidates,
} from "../../lib/domain/categories/candidate";

// ---------------------------------------------------------------------------
// テスト用カテゴリリスト
// ---------------------------------------------------------------------------

function catId(id: string): Id<"categories"> {
  return id as unknown as Id<"categories">;
}

type Category = { _id: Id<"categories">; name: string };

function makeCategories(names: string[]): Category[] {
  return names.map((name, i) => ({ _id: catId(`cat-${i}`), name }));
}

const DEFAULT_CATEGORIES = makeCategories([
  "食費",
  "日用品",
  "外食",
  "交通",
  "医療",
  "娯楽",
  "衣服",
  "その他",
  "税金",
  "公共料金",
  "保険",
  "通信",
]);

// ---------------------------------------------------------------------------
// buildCategoryCandidates
// ---------------------------------------------------------------------------

describe("buildCategoryCandidates", () => {
  it("候補の最大数定数を公開する", () => {
    expect(CATEGORY_CANDIDATE_MAX).toBe(20);
  });

  it("全カテゴリが上限以下なら全件を候補として返す", () => {
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categories: DEFAULT_CATEGORIES,
    });
    expect(candidates.length).toBe(DEFAULT_CATEGORIES.length);
  });

  it("レシートでAIが推定したcategoryNameと一致するカテゴリを候補の先頭に返す", () => {
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categoryName: "食費",
      categories: DEFAULT_CATEGORIES,
    });
    expect(candidates[0].name).toBe("食費");
  });

  it("コンビニ払込票でpaymentPurposeがカテゴリ名と一致するとき優先候補にする", () => {
    const candidates = buildCategoryCandidates({
      documentType: "convenience_payment",
      // paymentPurpose がカテゴリ名「税金」と完全一致 → 先頭に来る
      paymentPurpose: "税金",
      categories: DEFAULT_CATEGORIES,
    });
    // 「税金」カテゴリが先頭に来る
    expect(candidates[0].name).toBe("税金");
  });

  it("コンビニ払込票でpaymentPurposeがカテゴリ名を含むとき優先候補にする", () => {
    const candidates = buildCategoryCandidates({
      documentType: "convenience_payment",
      // paymentPurpose「公共料金・電気」→「公共料金」カテゴリに部分一致
      paymentPurpose: "公共料金・電気",
      categories: DEFAULT_CATEGORIES,
    });
    // 「公共料金」カテゴリが先頭グループに含まれる
    const topNames = candidates.slice(0, 3).map((c) => c.name);
    expect(topNames).toContain("公共料金");
  });

  it("コンビニ払込票でpaymentPlaceだけがあってもpaymentPlaceをカテゴリ根拠の主軸にしない", () => {
    const candidates = buildCategoryCandidates({
      documentType: "convenience_payment",
      paymentPlace: "セブンイレブン",
      categories: DEFAULT_CATEGORIES,
    });
    // paymentPlace のみでは「食費」「日用品」などコンビニ系を先頭にプッシュしない
    // → categoryName もなければ全件返すだけ（順序変更なし）
    expect(candidates.length).toBe(DEFAULT_CATEGORIES.length);
    // 最初の候補は DEFAULT_CATEGORIES の先頭（食費）のまま
    expect(candidates[0].name).toBe("食費");
  });

  it("全カテゴリが上限を超える場合は上限数に切り詰める", () => {
    const manyCategories = makeCategories(Array.from({ length: 30 }, (_, i) => `カテゴリ${i + 1}`));
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categories: manyCategories,
    });
    expect(candidates.length).toBeLessThanOrEqual(CATEGORY_CANDIDATE_MAX);
  });

  it("カテゴリが0件なら空配列を返す", () => {
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categories: [],
    });
    expect(candidates).toEqual([]);
  });

  it("shopNameにカテゴリ名が含まれるとき優先候補にする", () => {
    const categories = makeCategories(["食費", "外食", "医療", "交通"]);
    // shopName「外食チェーン」→「外食」がカテゴリ名として含まれる
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      shopName: "外食チェーン",
      categories,
    });
    // 「外食」が先頭に来る
    expect(candidates[0].name).toBe("外食");
  });

  it("shopNameにカテゴリ名が一致しないとき順序を変えない", () => {
    const categories = makeCategories(["食費", "外食", "医療", "交通"]);
    // shopName「薬局ツルハ」→ どのカテゴリ名とも一致しないため全件を元順で返す
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      shopName: "薬局ツルハ",
      categories,
    });
    expect(candidates.length).toBe(categories.length);
    // スコア0で全件同点 → 元の順序のまま
    expect(candidates[0].name).toBe("食費");
  });

  it("categoryNameに前後の空白があっても正しくマッチする", () => {
    const categories = makeCategories(["食費", "日用品"]);
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categoryName: " 食費 ",
      categories,
    });
    expect(candidates[0].name).toBe("食費");
  });

  it("複数キーワードのスコアが累積される", () => {
    const categories = makeCategories(["食費", "外食", "日用品"]);
    // categoryName「食」+ shopName「外食」→ 「外食」が両方にマッチして高スコア
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categoryName: "食",
      shopName: "外食レストラン",
      categories,
    });
    // 「外食」が最も高スコア（categoryNameで部分一致 + shopNameで完全一致）
    expect(candidates[0].name).toBe("外食");
  });

  it("大文字小文字が異なっても正しくマッチする", () => {
    const categories = makeCategories(["Food", "Drink"]);
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categoryName: "food",
      categories,
    });
    expect(candidates[0].name).toBe("Food");
  });

  it("空のカテゴリ名はスコアリングに影響しない", () => {
    const categories = [
      { _id: catId("cat-0"), name: "", color: "#F4A27A", isActive: true, sortOrder: 1 },
      { _id: catId("cat-1"), name: "食費", color: "#A6B28B", isActive: true, sortOrder: 2 },
    ];
    const candidates = buildCategoryCandidates({
      documentType: "receipt",
      categoryName: "食費",
      categories,
    });
    // 空nameはスコア0なので「食費」が先頭
    expect(candidates[0].name).toBe("食費");
  });
});

// ---------------------------------------------------------------------------
// resolveCategoryIdFromCandidates
// ---------------------------------------------------------------------------

describe("resolveCategoryIdFromCandidates", () => {
  it("候補リストの中にcategoryNameと完全一致するものがあればそのIDを返す", () => {
    const candidates = makeCategories(["食費", "日用品"]);
    const result = resolveCategoryIdFromCandidates("食費", candidates);
    expect(result).toBe(catId("cat-0"));
  });

  it("候補リストに一致するものがなければundefinedを返す", () => {
    const candidates = makeCategories(["食費", "日用品"]);
    const result = resolveCategoryIdFromCandidates("存在しないカテゴリ", candidates);
    expect(result).toBeUndefined();
  });

  it("categoryNameが空文字のときはundefinedを返す", () => {
    const candidates = makeCategories(["食費"]);
    const result = resolveCategoryIdFromCandidates("", candidates);
    expect(result).toBeUndefined();
  });

  it("categoryNameがundefinedのときはundefinedを返す", () => {
    const candidates = makeCategories(["食費"]);
    const result = resolveCategoryIdFromCandidates(undefined, candidates);
    expect(result).toBeUndefined();
  });

  it("候補が空配列のときはundefinedを返す", () => {
    const result = resolveCategoryIdFromCandidates("食費", []);
    expect(result).toBeUndefined();
  });

  it("categoryNameに前後の空白があっても正しくマッチする", () => {
    const candidates = makeCategories(["食費", "日用品"]);
    const result = resolveCategoryIdFromCandidates("  食費  ", candidates);
    expect(result).toBe(catId("cat-0"));
  });

  it("大文字小文字が異なっても正しくマッチする", () => {
    const candidates = makeCategories(["Food", "日用品"]);
    const result = resolveCategoryIdFromCandidates("food", candidates);
    expect(result).toBe(catId("cat-0"));
  });
});
