import { describe, expect, it } from "vitest";
import type { EntryFavoriteFields } from "../../domain/entryFavorites/entryFavorite";
import type { EntryFavoriteRepository } from "../../domain/entryFavorites/entryFavoriteRepository";
import { deleteEntryFavorite, listEntryFavorites, saveEntryFavorite } from "./entryFavorites";

function makeRepo(initial: EntryFavoriteFields[] = []) {
  const store = new Map<string, EntryFavoriteFields>();
  let seq = 0;
  for (const f of initial) store.set(f.id, f);
  const repo: EntryFavoriteRepository = {
    findById: async (id) => store.get(id) ?? null,
    listByUserAndGroup: async (userId, groupId) =>
      [...store.values()].filter((f) => f.userId === userId && f.groupId === groupId),
    insert: async (fields) => {
      seq += 1;
      const id = `fav${seq}`;
      store.set(id, { ...fields, id });
      return id;
    },
    delete: async (id) => {
      store.delete(id);
    },
  };
  return { repo, store };
}

const ctx = { userId: "u1", groupId: "g1" };

describe("saveEntryFavorite", () => {
  it("有効な入力でお気に入りを保存する", async () => {
    const { repo, store } = makeRepo();
    const id = await saveEntryFavorite(
      ctx,
      { entryFavorites: repo },
      { title: "スーパー", categoryId: "c1", amountYen: 3000, memo: "週末まとめ買い" },
      100,
    );
    const saved = store.get(id);
    expect(saved).toMatchObject({
      userId: "u1",
      groupId: "g1",
      title: "スーパー",
      categoryId: "c1",
      amountYen: 3000,
      memo: "週末まとめ買い",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("店名なし・金額0以下・カテゴリなしはエラー", async () => {
    const { repo } = makeRepo();
    await expect(
      saveEntryFavorite(
        ctx,
        { entryFavorites: repo },
        { title: " ", categoryId: "c1", amountYen: 100 },
        0,
      ),
    ).rejects.toThrow("店舗名 / 支払先は必須です");
    await expect(
      saveEntryFavorite(
        ctx,
        { entryFavorites: repo },
        { title: "a", categoryId: "c1", amountYen: 0 },
        0,
      ),
    ).rejects.toThrow("金額は1円以上の整数で入力してください");
    await expect(
      saveEntryFavorite(
        ctx,
        { entryFavorites: repo },
        { title: "a", categoryId: " ", amountYen: 100 },
        0,
      ),
    ).rejects.toThrow("カテゴリを選択してください");
  });
});

describe("listEntryFavorites", () => {
  it("自分と現在グループのお気に入りだけ返す", async () => {
    const { repo } = makeRepo([
      {
        id: "a",
        userId: "u1",
        groupId: "g1",
        title: "x",
        categoryId: "c1",
        amountYen: 1,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "b",
        userId: "u2",
        groupId: "g1",
        title: "y",
        categoryId: "c1",
        amountYen: 1,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "c",
        userId: "u1",
        groupId: "g2",
        title: "z",
        categoryId: "c1",
        amountYen: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    const list = await listEntryFavorites(ctx, { entryFavorites: repo });
    expect(list.map((f) => f.id)).toEqual(["a"]);
  });
});

describe("deleteEntryFavorite", () => {
  it("自分のお気に入りを削除する", async () => {
    const { repo, store } = makeRepo([
      {
        id: "a",
        userId: "u1",
        groupId: "g1",
        title: "x",
        categoryId: "c1",
        amountYen: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    await deleteEntryFavorite(ctx, { entryFavorites: repo }, "a");
    expect(store.has("a")).toBe(false);
  });

  it("他人・別グループのお気に入りは削除できない", async () => {
    const { repo } = makeRepo([
      {
        id: "a",
        userId: "u2",
        groupId: "g1",
        title: "x",
        categoryId: "c1",
        amountYen: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    await expect(deleteEntryFavorite(ctx, { entryFavorites: repo }, "a")).rejects.toThrow(
      "お気に入りが見つかりません",
    );
  });
});
