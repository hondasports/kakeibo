// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

type TestT = ReturnType<typeof convexTest>;

async function seedMember(t: TestT, userId: string, existingGroupId?: Id<"groups">) {
  return await t.run(async (ctx) => {
    const groupId =
      existingGroupId ??
      (await ctx.db.insert("groups", {
        name: `group-of-${userId}`,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }));
    await ctx.db.insert("users", {
      userId,
      displayName: userId,
      createdAt: 1,
      updatedAt: 1,
      activeGroupId: groupId,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    return groupId;
  });
}

async function insertCategory(
  t: TestT,
  groupId: Id<"groups">,
  name = "食費",
): Promise<Id<"categories">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("categories", {
        groupId,
        name,
        color: "#000000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
  );
}

async function countEntryFavorites(t: TestT): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.query("entryFavorites").collect()).length);
}

describe("entryFavorites", () => {
  it("未認証は保存・一覧・削除を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    // validator に通る実IDを用意する（認証チェックはハンドラ先頭なので参照はされない）
    const groupId = await seedMember(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const alice = t.withIdentity(identity("alice"));
    const favoriteId = await alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
      title: "スーパー",
      categoryId,
      amountYen: 3000,
    });

    await expect(t.query(api.entryFavorites.queries.listEntryFavorites, {})).rejects.toThrow(
      "Not authenticated",
    );
    await expect(
      t.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
        title: "スーパー",
        categoryId,
        amountYen: 3000,
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.mutation(api.entryFavorites.mutations.deleteEntryFavorite, {
        entryFavoriteId: favoriteId,
      }),
    ).rejects.toThrow("Not authenticated");
    expect(await countEntryFavorites(t)).toBe(1);
  });

  it("グループ未所属の利用者は拒否され、保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedMember(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const stranger = t.withIdentity(identity("stranger"));
    await expect(stranger.query(api.entryFavorites.queries.listEntryFavorites, {})).rejects.toThrow(
      "グループに所属していません",
    );
    await expect(
      stranger.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
        title: "スーパー",
        categoryId,
        amountYen: 3000,
      }),
    ).rejects.toThrow("グループに所属していません");
    expect(await countEntryFavorites(t)).toBe(0);
  });

  it("保存したお気に入りが一覧で返る", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedMember(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const alice = t.withIdentity(identity("alice"));

    const id = await alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
      title: "スーパー",
      categoryId,
      amountYen: 3000,
      memo: "週末まとめ買い",
    });
    const list = await alice.query(api.entryFavorites.queries.listEntryFavorites, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      userId: "alice",
      groupId,
      title: "スーパー",
      categoryId,
      amountYen: 3000,
      memo: "週末まとめ買い",
    });
  });

  it("別グループのカテゴリは拒否され、保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedMember(t, "alice");
    const otherGroupId = await seedMember(t, "bob");
    const otherCategoryId = await insertCategory(t, otherGroupId, "別グループのカテゴリ");
    expect(groupId).not.toBe(otherGroupId);

    const alice = t.withIdentity(identity("alice"));
    await expect(
      alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
        title: "スーパー",
        categoryId: otherCategoryId,
        amountYen: 3000,
      }),
    ).rejects.toThrow("Category does not belong to the current group");
    expect(await countEntryFavorites(t)).toBe(0);
  });

  it("他人・別グループのお気に入りは一覧に出ない", async () => {
    const t = convexTest(schema, convexTestModules);
    const sharedGroupId = await seedMember(t, "alice");
    await seedMember(t, "bob", sharedGroupId);
    await seedMember(t, "carol");
    const categoryId = await insertCategory(t, sharedGroupId);

    const alice = t.withIdentity(identity("alice"));
    await alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
      title: "aliceのお気に入り",
      categoryId,
      amountYen: 3000,
    });

    // 同じグループの他人（bob）にも、別グループの利用者（carol）にも出ない
    for (const other of ["bob", "carol"]) {
      const list = await t
        .withIdentity(identity(other))
        .query(api.entryFavorites.queries.listEntryFavorites, {});
      expect(list).toEqual([]);
    }
    const ownList = await alice.query(api.entryFavorites.queries.listEntryFavorites, {});
    expect(ownList).toHaveLength(1);
  });

  it("他人のお気に入りは削除できず残る。自分のものは削除できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const sharedGroupId = await seedMember(t, "alice");
    await seedMember(t, "bob", sharedGroupId);
    const categoryId = await insertCategory(t, sharedGroupId);

    const alice = t.withIdentity(identity("alice"));
    const bob = t.withIdentity(identity("bob"));
    const id = await alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
      title: "aliceのお気に入り",
      categoryId,
      amountYen: 3000,
    });

    await expect(
      bob.mutation(api.entryFavorites.mutations.deleteEntryFavorite, { entryFavoriteId: id }),
    ).rejects.toThrow("お気に入りが見つかりません");
    expect(await countEntryFavorites(t)).toBe(1);

    await alice.mutation(api.entryFavorites.mutations.deleteEntryFavorite, {
      entryFavoriteId: id,
    });
    expect(await countEntryFavorites(t)).toBe(0);
  });

  it("入力エラーのとき保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedMember(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const alice = t.withIdentity(identity("alice"));

    await expect(
      alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
        title: " ",
        categoryId,
        amountYen: 3000,
      }),
    ).rejects.toThrow("店舗名 / 支払先は必須です");
    await expect(
      alice.mutation(api.entryFavorites.mutations.saveEntryFavorite, {
        title: "スーパー",
        categoryId,
        amountYen: 0,
      }),
    ).rejects.toThrow("金額は1円以上の整数で入力してください");
    expect(await countEntryFavorites(t)).toBe(0);
  });
});
