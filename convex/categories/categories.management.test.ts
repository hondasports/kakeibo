import type { Id } from "../_generated/dataModel";
import {
  createCategoryHandler,
  deactivateCategoryHandler,
  updateCategoryHandler,
} from "./mutations";
import { listForSettingsHandler, listActiveHandler } from "./queries";
import {
  CategoryDoc,
  GroupMemberDoc,
  createIdentity,
  createMutationCtx,
  createQueryCtx,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("listActive", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createQueryCtx(null);

    await expect(listActiveHandler(ctx)).rejects.toBeInstanceOf(ConvexError);
    await expect(listActiveHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("認証済みの場合はアクティブなカテゴリ一覧を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-list",
    });

    const docs: CategoryDoc[] = [
      {
        _id: "id-1",
        _creationTime: 1000,
        groupId: "group-001",
        name: "食費",
        color: "#8B5E3C",
        isActive: true,
        sortOrder: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-2",
        _creationTime: 1000,
        groupId: "group-001",
        name: "日用品",
        color: "#A6B28B",
        isActive: true,
        sortOrder: 2,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const ctx = createQueryCtx(identity, docs);
    const result = await listActiveHandler(ctx);

    expect(result).toEqual(docs);
  });
});

// ---------------------------------------------------------------------------
// listForSettings / create / update / deactivate テスト
// ---------------------------------------------------------------------------

describe("category management", () => {
  const GROUP_ID = "group-cat-mgmt" as Id<"groups">;
  const OTHER_GROUP_ID = "group-other" as Id<"groups">;

  const identityOwner = createIdentity({
    tokenIdentifier: "https://issuer.example|category-user",
  });

  const groupMemberOwner: GroupMemberDoc = {
    _id: "member-owner",
    _creationTime: 1000,
    groupId: GROUP_ID,
    userId: identityOwner.tokenIdentifier,
    role: "owner",
  };

  const activeCategory: CategoryDoc = {
    _id: "cat-active",
    _creationTime: 1000,
    groupId: GROUP_ID,
    name: "食費",
    color: "#8B5E3C",
    isActive: true,
    sortOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const inactiveCategory: CategoryDoc = {
    ...activeCategory,
    _id: "cat-inactive",
    name: "旧カテゴリ",
    color: "#765F4F",
    isActive: false,
    sortOrder: 2,
  };

  it("listForSettings は inactive を含むカテゴリ一覧を返す", async () => {
    const docs = [activeCategory, inactiveCategory];
    const ctx = createQueryCtx(identityOwner, docs, groupMemberOwner);

    const result = await listForSettingsHandler(ctx);

    expect(result).toEqual(docs);
  });

  it("createCategory は既存最大 sortOrder の次でカテゴリを作成する", async () => {
    const ctx = createMutationCtx(
      identityOwner,
      [activeCategory, inactiveCategory],
      groupMemberOwner,
    );

    await createCategoryHandler(ctx, {
      name: "ペット用品",
      color: "#AAB7C4",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "categories",
      expect.objectContaining({
        groupId: GROUP_ID,
        name: "ペット用品",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 3,
      }),
    );
  });

  it("createCategory は分類ヒントを200文字以内で保存する", async () => {
    const ctx = createMutationCtx(identityOwner, [activeCategory], groupMemberOwner);

    await createCategoryHandler(ctx, {
      name: "ペット用品",
      color: "#AAB7C4",
      description: "ペットフードとペット用品を分類する基準",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "categories",
      expect.objectContaining({ description: "ペットフードとペット用品を分類する基準" }),
    );
  });

  it("createCategory は分類ヒントが201文字以上なら拒否する", async () => {
    const ctx = createMutationCtx(identityOwner, [activeCategory], groupMemberOwner);

    await expect(
      createCategoryHandler(ctx, {
        name: "上限超過ヒント",
        color: "#AAB7C4",
        description: "あ".repeat(201),
      }),
    ).rejects.toMatchObject({ data: "Category description must be 200 characters or fewer" });
  });

  it("createCategory はカテゴリが100件以上ある場合は拒否する", async () => {
    const existingDocs: CategoryDoc[] = Array.from({ length: 100 }, (_, index) => ({
      ...activeCategory,
      _id: `cat-${index + 1}`,
      name: `カテゴリ${index + 1}`,
      sortOrder: index + 1,
    }));
    const ctx = createMutationCtx(identityOwner, existingDocs, groupMemberOwner);

    await expect(
      createCategoryHandler(ctx, {
        name: "上限超過",
        color: "#AAB7C4",
      }),
    ).rejects.toMatchObject({
      data: "Category limit reached",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("updateCategory は所有カテゴリの名前と色を更新する", async () => {
    const ctx = createMutationCtx(identityOwner, [activeCategory], groupMemberOwner);

    await updateCategoryHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-active" as any,
      name: "食料品",
      color: "#8B5E3C",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "cat-active",
      expect.objectContaining({
        name: "食料品",
        color: "#8B5E3C",
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("updateCategory は空の分類ヒントを明示的なクリアとして保存する", async () => {
    const ctx = createMutationCtx(identityOwner, [activeCategory], groupMemberOwner);

    await updateCategoryHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-active" as any,
      name: "食費",
      color: "#8B5E3C",
      description: "",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "cat-active",
      expect.objectContaining({ description: "" }),
    );
  });

  it("deactivateCategory は所有カテゴリを無効化する", async () => {
    const ctx = createMutationCtx(identityOwner, [activeCategory], groupMemberOwner);

    await deactivateCategoryHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-active" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "cat-active",
      expect.objectContaining({
        isActive: false,
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("他グループのカテゴリは更新できない", async () => {
    const otherGroupCategory: CategoryDoc = {
      ...activeCategory,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(identityOwner, [otherGroupCategory], groupMemberOwner);

    await expect(
      updateCategoryHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-active" as any,
        name: "不正更新",
        color: "#000000",
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("他グループのカテゴリは無効化できない", async () => {
    const otherGroupCategory: CategoryDoc = {
      ...activeCategory,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(identityOwner, [otherGroupCategory], groupMemberOwner);

    await expect(
      deactivateCategoryHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-active" as any,
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});
