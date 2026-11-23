// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

async function seedMember(
  t: ReturnType<typeof convexTest>,
  userId: string,
  groupName: string,
  existingGroupId?: Awaited<ReturnType<typeof insertGroup>>,
) {
  return t.run(async (ctx) => {
    const groupId =
      existingGroupId ??
      (await ctx.db.insert("groups", {
        name: groupName,
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

async function insertGroup(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert("groups", { name: "共有", status: "active", createdAt: 1, updatedAt: 1 }),
  );
}

describe("savedExpenseSearches", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("未認証は一覧・保存・記録・削除を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(
      t.query(api.savedExpenseSearches.queries.listSavedExpenseSearches, {}),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, { name: "a", query: "q=a" }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.mutation(api.savedExpenseSearches.mutations.recordRecentExpenseSearch, { query: "q=a" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("グループ未所属の利用者は拒否される", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(
      t
        .withIdentity(identity("stranger"))
        .mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
          name: "a",
          query: "q=a",
        }),
    ).rejects.toThrow("グループに所属していません");
  });

  it("保存と最近の検索を記録でき、一覧で返る（userId・groupIdは返さない）", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedMember(t, "alice", "グループA");
    const alice = t.withIdentity(identity("alice"));
    await alice.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
      name: "  先月の食費 ",
      query: "categoryId=c1",
    });
    await alice.mutation(api.savedExpenseSearches.mutations.recordRecentExpenseSearch, {
      query: "q=北浜",
    });
    await alice.mutation(api.savedExpenseSearches.mutations.recordRecentExpenseSearch, {
      query: "  ",
    });
    const list = await alice.query(api.savedExpenseSearches.queries.listSavedExpenseSearches, {});
    expect(list.saved).toHaveLength(1);
    expect(list.saved[0]).toMatchObject({ name: "先月の食費", query: "categoryId=c1" });
    expect(list.recent.map((r) => r.query)).toEqual(["q=北浜"]);
    expect(JSON.stringify(list)).not.toContain("alice");
  });

  it("別利用者・別グループの保存条件は一覧に出ない", async () => {
    const t = convexTest(schema, convexTestModules);
    const sharedGroup = await insertGroup(t);
    await seedMember(t, "alice", "ignored", sharedGroup);
    await seedMember(t, "bob", "ignored", sharedGroup);
    await seedMember(t, "carol", "別グループ");

    const alice = t.withIdentity(identity("alice"));
    await alice.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
      name: "aliceの条件",
      query: "q=alice",
    });
    await alice.mutation(api.savedExpenseSearches.mutations.recordRecentExpenseSearch, {
      query: "q=alice-recent",
    });

    for (const other of ["bob", "carol"]) {
      const list = await t
        .withIdentity(identity(other))
        .query(api.savedExpenseSearches.queries.listSavedExpenseSearches, {});
      expect(list).toEqual({ saved: [], recent: [] });
    }
  });

  it("他人の保存条件の削除は拒否され、対象は残る。自分のものは削除できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const sharedGroup = await insertGroup(t);
    await seedMember(t, "alice", "ignored", sharedGroup);
    await seedMember(t, "bob", "ignored", sharedGroup);
    const alice = t.withIdentity(identity("alice"));
    const bob = t.withIdentity(identity("bob"));
    const id = await alice.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
      name: "aliceの条件",
      query: "q=alice",
    });

    await expect(
      bob.mutation(api.savedExpenseSearches.mutations.deleteSavedExpenseSearch, {
        savedExpenseSearchId: id,
      }),
    ).rejects.toThrow("保存した検索が見つかりません");
    const stillThere = await alice.query(
      api.savedExpenseSearches.queries.listSavedExpenseSearches,
      {},
    );
    expect(stillThere.saved).toHaveLength(1);

    await alice.mutation(api.savedExpenseSearches.mutations.deleteSavedExpenseSearch, {
      savedExpenseSearchId: id,
    });
    const afterDelete = await alice.query(
      api.savedExpenseSearches.queries.listSavedExpenseSearches,
      {},
    );
    expect(afterDelete.saved).toEqual([]);
  });

  it("検証エラーの文言をクライアントへ返し、不正な入力は保存しない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedMember(t, "alice", "グループA");
    const alice = t.withIdentity(identity("alice"));
    await expect(
      alice.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
        name: " ",
        query: "q=a",
      }),
    ).rejects.toThrow("名前を入力してください");
    await expect(
      alice.mutation(api.savedExpenseSearches.mutations.saveExpenseSearch, {
        name: "a",
        query: "x".repeat(501),
      }),
    ).rejects.toThrow("検索条件が長すぎます");
    const list = await alice.query(api.savedExpenseSearches.queries.listSavedExpenseSearches, {});
    expect(list.saved).toEqual([]);
  });

  it("recent は5件で頭打ちになり、同じ条件は重複しない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedMember(t, "alice", "グループA");
    const alice = t.withIdentity(identity("alice"));
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const [index, n] of [1, 2, 3, 4, 5, 6, 3].entries()) {
      // updatedAt の新旧で並ぶため、記録ごとに時刻を進める。
      vi.setSystemTime(1_000 * (index + 1));
      await alice.mutation(api.savedExpenseSearches.mutations.recordRecentExpenseSearch, {
        query: `q=${n}`,
      });
    }
    const { recent } = await alice.query(
      api.savedExpenseSearches.queries.listSavedExpenseSearches,
      {},
    );
    expect(recent).toHaveLength(5);
    expect(recent.map((r) => r.query).sort()).toEqual(["q=2", "q=3", "q=4", "q=5", "q=6"]);
    expect(recent[0].query).toBe("q=3");
  });
});
