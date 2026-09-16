import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "../../domain/categories/defaults";
import type {
  CategoryStore,
  CategoryStoreRecord,
  NewCategoryFields,
} from "../../domain/categories/store";
import {
  createCategory,
  deactivateCategory,
  seedDefaultCategories,
  updateCategory,
} from "./operations";
import { deleteE2eCategoriesByGroup, ensureE2eCategory } from "./e2e";

function record(partial: Partial<CategoryStoreRecord>): CategoryStoreRecord {
  return {
    id: "cat-1",
    creationTime: 1000,
    groupId: "g1",
    name: "食費",
    color: "#8B5E3C",
    isActive: true,
    sortOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...partial,
  };
}

function createStore(overrides: Partial<CategoryStore> = {}): CategoryStore {
  return {
    findByGroupAndSortOrder: vi.fn().mockResolvedValue(null),
    listForWriteByGroup: vi.fn().mockResolvedValue([]),
    listActive: vi.fn().mockResolvedValue([]),
    listForSettings: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue("new-id"),
    patch: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("seedDefaultCategories", () => {
  it("既存なしなら全件 insert して created を返す", async () => {
    const store = createStore();
    const result = await seedDefaultCategories(store, "g1", 5000);
    expect(result).toEqual({ created: DEFAULT_CATEGORIES.length, skipped: 0 });
    expect(store.insert).toHaveBeenCalledTimes(DEFAULT_CATEGORIES.length);
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "g1", name: "食費", sortOrder: 1 }),
    );
  });

  it("sortOrder 既存なら patch 判定のみで insert しない", async () => {
    const existing = record({ sortOrder: 1, color: "#FF6B6B" });
    const store = createStore({
      findByGroupAndSortOrder: vi
        .fn()
        .mockImplementation(async (_g: string, s: number) => (s === 1 ? existing : null)),
    });
    const result = await seedDefaultCategories(store, "g1", 5000);
    expect(result).toEqual({ created: 7, skipped: 1 });
    expect(store.patch).toHaveBeenCalledWith("cat-1", {
      color: DEFAULT_CATEGORIES[0].color,
      description: DEFAULT_CATEGORIES[0].description,
      updatedAt: 5000,
    });
    expect(store.patch).toHaveBeenCalledTimes(1);
  });
});

describe("createCategory", () => {
  it("上限未満なら max+1 の sortOrder で insert して get を返す", async () => {
    const created = record({ id: "new-id", name: "ペット用品", sortOrder: 3 });
    const store = createStore({
      listForWriteByGroup: vi
        .fn()
        .mockResolvedValue([record({ sortOrder: 2 }), record({ id: "c2", sortOrder: 1 })]),
      get: vi.fn().mockResolvedValue(created),
    });
    const result = await createCategory(
      store,
      "g1",
      { name: "ペット用品", color: "#AAB7C4" },
      5000,
    );
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 3, isActive: true }),
    );
    const inserted = (store.insert as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as NewCategoryFields;
    expect(inserted).not.toHaveProperty("description");
    expect(result).toBe(created);
  });

  it("上限到達なら既存文言で拒否し insert しない", async () => {
    const store = createStore({
      listForWriteByGroup: vi
        .fn()
        .mockResolvedValue(Array.from({ length: 100 }, (_, i) => record({ sortOrder: i }))),
    });
    await expect(
      createCategory(store, "g1", { name: "X", color: "#000000" }, 5000),
    ).rejects.toThrow("Category limit reached");
    expect(store.insert).not.toHaveBeenCalled();
  });
});

describe("updateCategory", () => {
  it("所有カテゴリを更新する。description 未指定なら patch に含めない", async () => {
    const target = record({ id: "cat-1" });
    const store = createStore({ get: vi.fn().mockResolvedValue(target) });
    await updateCategory(
      store,
      "g1",
      { categoryId: "cat-1", name: "食料品", color: "#111111" },
      5000,
    );
    expect(store.patch).toHaveBeenCalledWith("cat-1", {
      name: "食料品",
      color: "#111111",
      updatedAt: 5000,
    });
  });

  it("description: 空文字は明示クリアとして patch に含める", async () => {
    const target = record({ id: "cat-1" });
    const store = createStore({ get: vi.fn().mockResolvedValue(target) });
    await updateCategory(
      store,
      "g1",
      { categoryId: "cat-1", name: "食費", color: "#8B5E3C", description: "" },
      5000,
    );
    expect(store.patch).toHaveBeenCalledWith("cat-1", expect.objectContaining({ description: "" }));
  });

  it("別グループ所属は拒否する", async () => {
    const store = createStore({ get: vi.fn().mockResolvedValue(record({ groupId: "g2" })) });
    await expect(
      updateCategory(store, "g1", { categoryId: "cat-1", name: "X", color: "#000000" }, 5000),
    ).rejects.toThrow("Category does not belong to the current group");
  });
});

describe("deactivateCategory", () => {
  it("所有カテゴリを isActive:false で patch して get を返す", async () => {
    const target = record({ id: "cat-1" });
    const store = createStore({ get: vi.fn().mockResolvedValue(target) });
    await deactivateCategory(store, "g1", "cat-1", 5000);
    expect(store.patch).toHaveBeenCalledWith("cat-1", {
      isActive: false,
      updatedAt: 5000,
    });
  });

  it("不存在は Category not found", async () => {
    const store = createStore();
    await expect(deactivateCategory(store, "g1", "cat-x", 5000)).rejects.toThrow(
      "Category not found",
    );
  });
});

describe("E2E categories", () => {
  it("deleteE2eCategoriesByGroup は prefix 一致だけを削除する", async () => {
    const store = createStore({
      listForWriteByGroup: vi
        .fn()
        .mockResolvedValue([
          record({ id: "e2e-1", name: "E2Eカテゴリ-A" }),
          record({ id: "keep-1", name: "食費" }),
          record({ id: "e2e-2", name: "E2Eカテゴリ-B" }),
        ]),
    });
    const result = await deleteE2eCategoriesByGroup(store, "g1");
    expect(result).toEqual({ deletedCount: 2 });
    expect(store.deleteMany).toHaveBeenCalledWith(["e2e-1", "e2e-2"]);
  });

  it("ensureE2eCategory は prefix 必須・既存名一致なら patch・なければ insert", async () => {
    const matched = record({ id: "e2e-1", name: "E2Eカテゴリ-A" });
    const store = createStore({ listForWriteByGroup: vi.fn().mockResolvedValue([matched]) });

    await expect(
      ensureE2eCategory(store, { groupId: "g1", name: "通常", color: "#000000" }, 5000),
    ).rejects.toThrow("E2E category name must start with the E2E prefix");

    const id = await ensureE2eCategory(
      store,
      { groupId: "g1", name: "E2Eカテゴリ-A", color: "#00FF00" },
      5000,
    );
    expect(id).toBe("e2e-1");
    expect(store.patch).toHaveBeenCalledWith("e2e-1", {
      color: "#00FF00",
      isActive: true,
      updatedAt: 5000,
    });
    expect(store.insert).not.toHaveBeenCalled();

    const store2 = createStore({ insert: vi.fn().mockResolvedValue("new-e2e") });
    const id2 = await ensureE2eCategory(
      store2,
      { groupId: "g1", name: "E2Eカテゴリ-B", color: "#00FF00" },
      5000,
    );
    expect(id2).toBe("new-e2e");
    expect(store2.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "E2Eカテゴリ-B", sortOrder: 1 }),
    );
  });
});
