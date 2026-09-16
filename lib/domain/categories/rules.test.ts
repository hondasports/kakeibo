import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./defaults";
import {
  assertCategoryLimit,
  assertE2eCategoryName,
  assertOwnedCategory,
  buildSeedPatch,
  E2E_CATEGORY_NAME_PREFIX,
  nextSortOrder,
} from "./rules";

describe("buildSeedPatch", () => {
  const defaultCategory = DEFAULT_CATEGORIES[0];

  it("既存がレガシー配色のままなら現行色への patch を返す", () => {
    const existing = {
      name: defaultCategory.name,
      description: "既存の説明",
      color: "#FF6B6B",
      sortOrder: defaultCategory.sortOrder,
    };
    const patch = buildSeedPatch(existing, defaultCategory, 5000);
    expect(patch).toEqual({ color: defaultCategory.color, updatedAt: 5000 });
  });

  it("名前が一致し description 未設定なら description を補完する", () => {
    const existing = {
      name: defaultCategory.name,
      color: defaultCategory.color,
      sortOrder: defaultCategory.sortOrder,
    };
    const patch = buildSeedPatch(existing, defaultCategory, 5000);
    expect(patch).toEqual({ description: defaultCategory.description, updatedAt: 5000 });
  });

  it("名前が異なる既存には patch を返さない", () => {
    const existing = {
      name: "独自カテゴリ",
      color: "#FF6B6B",
      sortOrder: defaultCategory.sortOrder,
    };
    expect(buildSeedPatch(existing, defaultCategory, 5000)).toBeNull();
  });

  it("現行色・description 済みなら null を返す", () => {
    const existing = {
      name: defaultCategory.name,
      description: "既存の説明",
      color: defaultCategory.color,
      sortOrder: defaultCategory.sortOrder,
    };
    expect(buildSeedPatch(existing, defaultCategory, 5000)).toBeNull();
  });
});

describe("assertCategoryLimit", () => {
  it("上限未満なら何もしない", () => {
    expect(() => assertCategoryLimit(99, 100)).not.toThrow();
  });
  it("上限到達で既存文言を投げる", () => {
    expect(() => assertCategoryLimit(100, 100)).toThrow("Category limit reached");
  });
});

describe("nextSortOrder", () => {
  it("0件なら1を返す", () => {
    expect(nextSortOrder([])).toBe(1);
  });
  it("最大 sortOrder + 1 を返す", () => {
    expect(nextSortOrder([{ sortOrder: 3 }, { sortOrder: 7 }, { sortOrder: 5 }])).toBe(8);
  });
});

describe("assertOwnedCategory", () => {
  const category = { groupId: "g1", name: "食費" };

  it("所有カテゴリを返す", () => {
    expect(assertOwnedCategory(category, "g1")).toBe(category);
  });
  it("不存在は Category not found", () => {
    expect(() => assertOwnedCategory(null, "g1")).toThrow("Category not found");
  });
  it("別グループ所属は既存文言で拒否する", () => {
    expect(() => assertOwnedCategory(category, "g2")).toThrow(
      "Category does not belong to the current group",
    );
  });
});

describe("assertE2eCategoryName", () => {
  it("prefix 一致なら通る", () => {
    expect(() => assertE2eCategoryName(`${E2E_CATEGORY_NAME_PREFIX}X`)).not.toThrow();
  });
  it("prefix 不一致は既存文言で拒否する", () => {
    expect(() => assertE2eCategoryName("通常カテゴリ")).toThrow(
      "E2E category name must start with the E2E prefix",
    );
  });
});
