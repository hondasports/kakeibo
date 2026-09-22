import type { Id } from "../_generated/dataModel";
import { seedDefaultCategoriesHandler } from "./mutations";
import { CategoryDoc, GroupMemberDoc, createIdentity, createMutationCtx } from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("seedDefaultCategories", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createMutationCtx(null);

    await expect(seedDefaultCategoriesHandler(ctx)).rejects.toBeInstanceOf(ConvexError);
    await expect(seedDefaultCategoriesHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("初回ログイン時に 8 件が作成される（created: 8, skipped: 0）", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-first-login",
    });
    // existingDocs = [] → 全件 insert されるケース
    const ctx = createMutationCtx(identity, []);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(result).toEqual({ created: 8, skipped: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledTimes(8);

    // 最初の insert が "categories" テーブルへ食費を追加することを確認
    expect(dbInsert).toHaveBeenCalledWith(
      "categories",
      expect.objectContaining({
        groupId: "group-001",
        name: "食費",
        color: "#8B5E3C",
        isActive: true,
        sortOrder: 1,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("初期カテゴリにはAI分類用の説明を設定する", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-with-hints",
    });
    const ctx = createMutationCtx(identity, []);

    await seedDefaultCategoriesHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "categories",
      expect.objectContaining({
        name: "医療",
        description: "医薬品、診察、治療費など。歯科用品は日用品に分類する",
      }),
    );
  });

  it("既存標準カテゴリのdescription未設定時だけ初期ヒントを補完する", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-backfill-hints",
    });
    const existingDocs: CategoryDoc[] = [
      {
        _id: "existing-food",
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
        _id: "existing-daily",
        _creationTime: 1000,
        groupId: "group-001",
        name: "日用品",
        color: "#A6B28B",
        description: "ユーザー独自の分類基準",
        isActive: true,
        sortOrder: 2,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createMutationCtx(identity, existingDocs);

    await seedDefaultCategoriesHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "existing-food",
      expect.objectContaining({
        description: "スーパーや小売店で購入する食品、飲料、菓子など",
      }),
    );
    expect(dbPatch).not.toHaveBeenCalledWith(
      "existing-daily",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("2 回目以降は重複しない（created: 0, skipped: 8）", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-second-login",
    });

    // 8 件全て既存として渡す
    const existingDocs: CategoryDoc[] = [
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
      {
        _id: "id-3",
        _creationTime: 1000,
        groupId: "group-001",
        name: "外食",
        color: "#F4A27A",
        isActive: true,
        sortOrder: 3,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-4",
        _creationTime: 1000,
        groupId: "group-001",
        name: "交通",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 4,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-5",
        _creationTime: 1000,
        groupId: "group-001",
        name: "医療",
        color: "#C9734B",
        isActive: true,
        sortOrder: 5,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-6",
        _creationTime: 1000,
        groupId: "group-001",
        name: "娯楽",
        color: "#6F7F55",
        isActive: true,
        sortOrder: 6,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-7",
        _creationTime: 1000,
        groupId: "group-001",
        name: "衣服",
        color: "#D8B28F",
        isActive: true,
        sortOrder: 7,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-8",
        _creationTime: 1000,
        groupId: "group-001",
        name: "その他",
        color: "#765F4F",
        isActive: true,
        sortOrder: 8,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const ctx = createMutationCtx(identity, existingDocs);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(result).toEqual({ created: 0, skipped: 8 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("旧デフォルトカテゴリ色はSuzumemoパレットへ更新する", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-legacy-colors",
    });
    const existingDocs: CategoryDoc[] = [
      {
        _id: "id-legacy-food",
        _creationTime: 1000,
        groupId: "group-001",
        name: "食費",
        color: "#FF6B6B",
        isActive: true,
        sortOrder: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createMutationCtx(identity, existingDocs);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(result).toEqual({ created: 7, skipped: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "id-legacy-food",
      expect.objectContaining({
        color: "#8B5E3C",
        description: "スーパーや小売店で購入する食品、飲料、菓子など",
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("ユーザーが変更したカテゴリ色は上書きしない", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-custom-color",
    });
    const existingDocs: CategoryDoc[] = [
      {
        _id: "id-custom-food",
        _creationTime: 1000,
        groupId: "group-001",
        name: "食費",
        color: "#000000",
        isActive: true,
        sortOrder: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createMutationCtx(identity, existingDocs);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(result).toEqual({ created: 7, skipped: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "id-custom-food",
      expect.objectContaining({
        description: "スーパーや小売店で購入する食品、飲料、菓子など",
      }),
    );
  });

  it("groupId が異なるグループのカテゴリは分離される", async () => {
    const identityA = createIdentity({
      tokenIdentifier: "https://issuer.example|user-A",
    });
    const identityB = createIdentity({
      tokenIdentifier: "https://issuer.example|user-B",
    });

    const groupMemberA: GroupMemberDoc = {
      _id: "member-A",
      _creationTime: 1000,
      groupId: "group-A" as Id<"groups">,
      userId: identityA.tokenIdentifier,
      role: "owner",
    };
    const groupMemberB: GroupMemberDoc = {
      _id: "member-B",
      _creationTime: 1000,
      groupId: "group-B" as Id<"groups">,
      userId: identityB.tokenIdentifier,
      role: "owner",
    };

    // group-A のカテゴリのみ既存として用意
    const existingDocsForGroupA: CategoryDoc[] = [
      {
        _id: "id-1",
        _creationTime: 1000,
        groupId: "group-A",
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
        groupId: "group-A",
        name: "日用品",
        color: "#A6B28B",
        isActive: true,
        sortOrder: 2,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-3",
        _creationTime: 1000,
        groupId: "group-A",
        name: "外食",
        color: "#F4A27A",
        isActive: true,
        sortOrder: 3,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-4",
        _creationTime: 1000,
        groupId: "group-A",
        name: "交通",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 4,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-5",
        _creationTime: 1000,
        groupId: "group-A",
        name: "医療",
        color: "#C9734B",
        isActive: true,
        sortOrder: 5,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-6",
        _creationTime: 1000,
        groupId: "group-A",
        name: "娯楽",
        color: "#6F7F55",
        isActive: true,
        sortOrder: 6,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-7",
        _creationTime: 1000,
        groupId: "group-A",
        name: "衣服",
        color: "#D8B28F",
        isActive: true,
        sortOrder: 7,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-8",
        _creationTime: 1000,
        groupId: "group-A",
        name: "その他",
        color: "#765F4F",
        isActive: true,
        sortOrder: 8,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    // group-A は全件既存 → skipped: 8
    const ctxA = createMutationCtx(identityA, existingDocsForGroupA, groupMemberA);
    const resultA = await seedDefaultCategoriesHandler(ctxA);
    expect(resultA).toEqual({ created: 0, skipped: 8 });

    // group-B は既存なし → created: 8（group-A のドキュメントは影響しない）
    const ctxB = createMutationCtx(identityB, [], groupMemberB);
    const resultB = await seedDefaultCategoriesHandler(ctxB);
    expect(resultB).toEqual({ created: 8, skipped: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsertB = (ctxB.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsertB).toHaveBeenCalledTimes(8);
    // group-B の insert には group-B の groupId が使われていること
    expect(dbInsertB).toHaveBeenCalledWith(
      "categories",
      expect.objectContaining({
        groupId: "group-B",
      }),
    );
  });

  it("無効化済みカテゴリがある場合はデフォルトカテゴリを再作成しない", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-deactivated-default",
    });

    const existingDocs: CategoryDoc[] = [
      {
        _id: "id-1",
        _creationTime: 1000,
        groupId: "group-001",
        name: "食費",
        color: "#8B5E3C",
        isActive: false,
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
      {
        _id: "id-3",
        _creationTime: 1000,
        groupId: "group-001",
        name: "外食",
        color: "#F4A27A",
        isActive: true,
        sortOrder: 3,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-4",
        _creationTime: 1000,
        groupId: "group-001",
        name: "交通",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 4,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-5",
        _creationTime: 1000,
        groupId: "group-001",
        name: "医療",
        color: "#C9734B",
        isActive: true,
        sortOrder: 5,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-6",
        _creationTime: 1000,
        groupId: "group-001",
        name: "娯楽",
        color: "#6F7F55",
        isActive: true,
        sortOrder: 6,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-7",
        _creationTime: 1000,
        groupId: "group-001",
        name: "衣服",
        color: "#D8B28F",
        isActive: true,
        sortOrder: 7,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "id-8",
        _creationTime: 1000,
        groupId: "group-001",
        name: "その他",
        color: "#765F4F",
        isActive: true,
        sortOrder: 8,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const ctx = createMutationCtx(identity, existingDocs);

    const result = await seedDefaultCategoriesHandler(ctx);

    expect(result).toEqual({ created: 0, skipped: 8 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listActive テスト
// ---------------------------------------------------------------------------
