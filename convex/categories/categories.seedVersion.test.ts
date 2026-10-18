import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORIES_SEED_VERSION,
} from "../../lib/domain/categories/defaults";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { seedDefaultCategoriesHandler } from "./mutations";
import { createIdentity, createMutationCtx, type CategoryDoc } from "./testHelpers";

const groupId = "group-001" as Id<"groups">;

function createSeedCtx(version?: number, existingDocs: CategoryDoc[] = []) {
  const ctx = createMutationCtx(createIdentity(), existingDocs);
  const group: Doc<"groups"> = {
    _id: groupId,
    _creationTime: 1000,
    name: "テストグループ",
    createdAt: 1000,
    updatedAt: 1000,
    ...(version === undefined ? {} : { defaultCategoriesSeedVersion: version }),
  };
  vi.mocked(ctx.db.get).mockResolvedValue(group);
  return ctx;
}

describe("デフォルトカテゴリのseedバージョン", () => {
  it("既存グループのためにバージョンはoptionalなnumberとする", () => {
    expect(schema.tables.groups.validator.fields.defaultCategoriesSeedVersion).toMatchObject({
      kind: "float64",
      isOptional: "optional",
    });
  });

  it("現行バージョンならcategoriesを読まず、groupも更新しない", async () => {
    const ctx = createSeedCtx(DEFAULT_CATEGORIES_SEED_VERSION);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(ctx.db.query).not.toHaveBeenCalledWith("categories");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, skipped: DEFAULT_CATEGORIES.length });
  });

  it.each([undefined, DEFAULT_CATEGORIES_SEED_VERSION - 1, DEFAULT_CATEGORIES_SEED_VERSION + 1])(
    "バージョン%sでは既存カテゴリを補完し、不足分を作成した後にバージョンを更新する",
    async (version) => {
      const food = DEFAULT_CATEGORIES[0];
      const ctx = createSeedCtx(version, [
        {
          _id: "legacy-food",
          _creationTime: 1000,
          groupId,
          name: food.name,
          color: "#FF6B6B",
          isActive: false,
          sortOrder: food.sortOrder,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]);

      const result = await seedDefaultCategoriesHandler(ctx);

      expect(result).toEqual({ created: DEFAULT_CATEGORIES.length - 1, skipped: 1 });
      expect(ctx.db.insert).toHaveBeenCalledTimes(DEFAULT_CATEGORIES.length - 1);
      expect(ctx.db.patch).toHaveBeenCalledWith("legacy-food", {
        color: food.color,
        description: food.description,
        updatedAt: expect.any(Number),
      });
      expect(ctx.db.patch).toHaveBeenCalledTimes(2);
      expect(ctx.db.patch).toHaveBeenLastCalledWith(groupId, {
        defaultCategoriesSeedVersion: DEFAULT_CATEGORIES_SEED_VERSION,
      });
    },
  );

  it("初回seedの成功後は次の呼び出しでcategoriesを読まない", async () => {
    const ctx = createSeedCtx();
    vi.mocked(ctx.db.patch).mockImplementation(async (_id, patch) => {
      vi.mocked(ctx.db.get).mockResolvedValue({
        _id: groupId,
        _creationTime: 1000,
        name: "テストグループ",
        createdAt: 1000,
        updatedAt: 1000,
        ...patch,
      });
    });
    await seedDefaultCategoriesHandler(ctx);
    vi.mocked(ctx.db.query).mockClear();
    vi.mocked(ctx.db.insert).mockClear();
    vi.mocked(ctx.db.patch).mockClear();

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(ctx.db.query).not.toHaveBeenCalledWith("categories");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, skipped: DEFAULT_CATEGORIES.length });
  });

  it("seedが途中で失敗したらバージョンを更新しない", async () => {
    const ctx = createSeedCtx();
    vi.mocked(ctx.db.insert).mockRejectedValueOnce(new Error("seed failed"));

    await expect(seedDefaultCategoriesHandler(ctx)).rejects.toMatchObject({ data: "seed failed" });

    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("所属先グループが存在しなければseedもバージョン保存も行わない", async () => {
    const ctx = createSeedCtx();
    vi.mocked(ctx.db.get).mockResolvedValue(null);

    await expect(seedDefaultCategoriesHandler(ctx)).rejects.toMatchObject({
      data: "グループが見つかりません",
    });

    expect(ctx.db.query).not.toHaveBeenCalledWith("categories");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each(["未認証", "未所属"])("%sではバージョン確認前に拒否する", async (state) => {
    const ctx = createMutationCtx(state === "未認証" ? null : createIdentity(), [], null);

    await expect(seedDefaultCategoriesHandler(ctx)).rejects.toBeInstanceOf(ConvexError);

    expect(ctx.db.get).not.toHaveBeenCalled();
    expect(ctx.db.query).not.toHaveBeenCalledWith("categories");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
