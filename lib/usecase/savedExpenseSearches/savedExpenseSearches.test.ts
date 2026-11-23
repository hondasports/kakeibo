import { describe, expect, it } from "vitest";
import type { SavedExpenseSearchFields } from "../../domain/savedExpenseSearches/savedExpenseSearch";
import type { SavedExpenseSearchRepository } from "../../domain/savedExpenseSearches/savedExpenseSearchRepository";
import {
  deleteSavedExpenseSearch,
  listSavedExpenseSearches,
  recordRecentExpenseSearch,
  saveExpenseSearch,
} from "./savedExpenseSearches";

function makeRepo(initial: SavedExpenseSearchFields[] = []) {
  const store = new Map<string, SavedExpenseSearchFields>();
  let seq = 0;
  for (const f of initial) store.set(f.id, f);
  const repo: SavedExpenseSearchRepository = {
    findById: async (id) => store.get(id) ?? null,
    listByUserGroupAndKind: async (userId, groupId, kind) =>
      [...store.values()].filter(
        (f) => f.userId === userId && f.groupId === groupId && f.kind === kind,
      ),
    insert: async (fields) => {
      seq += 1;
      const id = `new${seq}`;
      store.set(id, { ...fields, id });
      return id;
    },
    touch: async (id, updatedAt) => {
      const current = store.get(id);
      if (current) store.set(id, { ...current, updatedAt });
    },
    delete: async (id) => {
      store.delete(id);
    },
  };
  return { repo, store };
}

const ctx = { userId: "u1", groupId: "g1" };

function row(
  id: string,
  overrides: Partial<SavedExpenseSearchFields> = {},
): SavedExpenseSearchFields {
  return {
    id,
    userId: "u1",
    groupId: "g1",
    kind: "saved",
    name: `name-${id}`,
    query: `q=${id}`,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("saveExpenseSearch", () => {
  it("最大80文字の日本語キーワード（URLエンコードで720文字）と全条件を指定したqueryを保存できる", async () => {
    const { repo, store } = makeRepo();
    const query = new URLSearchParams({
      type: "expense",
      sort: "amountDesc",
      q: "あ".repeat(80),
      categoryId: "k".repeat(32),
      min: "999999999",
      max: "999999999",
      from: "2026-01-01",
      to: "2026-12-31",
    }).toString();
    expect(query.length).toBeGreaterThan(720);
    expect(query.length).toBeLessThanOrEqual(2000);
    const id = await saveExpenseSearch(
      ctx,
      { savedExpenseSearches: repo },
      { name: "a", query },
      0,
    );
    expect(store.get(id)?.query).toBe(query);
  });

  it("名前の前後空白を除いて保存し、利用者・グループは認証済みctxから決める", async () => {
    const { repo, store } = makeRepo();
    const id = await saveExpenseSearch(
      ctx,
      { savedExpenseSearches: repo },
      { name: "  先月の食費  ", query: "categoryId=c1&from=2026-10-01" },
      100,
    );
    expect(store.get(id)).toMatchObject({
      userId: "u1",
      groupId: "g1",
      kind: "saved",
      name: "先月の食費",
      query: "categoryId=c1&from=2026-10-01",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("名前は1〜30文字（空・空白のみ・31文字は拒否）", async () => {
    const { repo, store } = makeRepo();
    const deps = { savedExpenseSearches: repo };
    await expect(saveExpenseSearch(ctx, deps, { name: "", query: "q=a" }, 0)).rejects.toThrow(
      "名前を入力してください",
    );
    await expect(saveExpenseSearch(ctx, deps, { name: "  　 ", query: "q=a" }, 0)).rejects.toThrow(
      "名前を入力してください",
    );
    await expect(
      saveExpenseSearch(ctx, deps, { name: "あ".repeat(31), query: "q=a" }, 0),
    ).rejects.toThrow("名前は30文字以内で入力してください");
    expect(store.size).toBe(0);

    await saveExpenseSearch(ctx, deps, { name: "あ", query: "q=a" }, 0);
    await saveExpenseSearch(ctx, deps, { name: "あ".repeat(30), query: "q=a" }, 0);
    expect(store.size).toBe(2);
  });

  it("queryは1〜2000文字（空は拒否・2001文字は拒否・2000文字は保存）", async () => {
    const { repo, store } = makeRepo();
    const deps = { savedExpenseSearches: repo };
    await expect(saveExpenseSearch(ctx, deps, { name: "a", query: "  " }, 0)).rejects.toThrow(
      "保存する検索条件がありません",
    );
    await expect(
      saveExpenseSearch(ctx, deps, { name: "a", query: "x".repeat(2001) }, 0),
    ).rejects.toThrow("検索条件が長すぎます");
    expect(store.size).toBe(0);

    await saveExpenseSearch(ctx, deps, { name: "a", query: "x".repeat(2000) }, 0);
    expect(store.size).toBe(1);
  });

  it("保存は20件まで。21件目は保存せずエラー（他人・最近の検索は数えない）", async () => {
    const own = Array.from({ length: 19 }, (_, i) => row(`s${i}`));
    const noise = [
      row("other-user", { userId: "u2" }),
      row("other-group", { groupId: "g2" }),
      row("recent", { kind: "recent", name: undefined }),
    ];
    const { repo, store } = makeRepo([...own, ...noise]);
    const deps = { savedExpenseSearches: repo };

    await saveExpenseSearch(ctx, deps, { name: "20件目", query: "q=20" }, 1);
    const sizeAt20 = store.size;
    await expect(
      saveExpenseSearch(ctx, deps, { name: "21件目", query: "q=21" }, 2),
    ).rejects.toThrow("保存できる検索条件は20件までです。不要な条件を削除してください。");
    expect(store.size).toBe(sizeAt20);
  });
});

describe("recordRecentExpenseSearch", () => {
  it("空・空白のqueryは記録しない", async () => {
    const { repo, store } = makeRepo();
    const result = await recordRecentExpenseSearch(
      ctx,
      { savedExpenseSearches: repo },
      { query: "  " },
      1,
    );
    expect(result).toBeNull();
    expect(store.size).toBe(0);
  });

  it("2000文字を超えるqueryは記録せずエラー", async () => {
    const { repo, store } = makeRepo();
    await expect(
      recordRecentExpenseSearch(
        ctx,
        { savedExpenseSearches: repo },
        { query: "x".repeat(2001) },
        1,
      ),
    ).rejects.toThrow("検索条件が長すぎます");
    expect(store.size).toBe(0);
  });

  it("新しいqueryは recent として追加する", async () => {
    const { repo, store } = makeRepo();
    const id = await recordRecentExpenseSearch(
      ctx,
      { savedExpenseSearches: repo },
      { query: "q=a" },
      10,
    );
    expect(id).not.toBeNull();
    expect(store.get(id as string)).toMatchObject({
      userId: "u1",
      groupId: "g1",
      kind: "recent",
      query: "q=a",
      createdAt: 10,
      updatedAt: 10,
    });
    expect(store.get(id as string)?.name).toBeUndefined();
  });

  it("同じqueryは重複させず updatedAt を更新して先頭へ移す", async () => {
    const { repo, store } = makeRepo([
      row("r1", { kind: "recent", name: undefined, query: "q=a", updatedAt: 1 }),
      row("r2", { kind: "recent", name: undefined, query: "q=b", updatedAt: 2 }),
    ]);
    const deps = { savedExpenseSearches: repo };
    const id = await recordRecentExpenseSearch(ctx, deps, { query: "q=a" }, 50);
    expect(id).toBe("r1");
    expect(store.size).toBe(2);
    const { recent } = await listSavedExpenseSearches(ctx, deps);
    expect(recent.map((r) => r.query)).toEqual(["q=a", "q=b"]);
  });

  it("保存済みと同じqueryでも recent は別に記録する", async () => {
    const { repo, store } = makeRepo([row("s1", { query: "q=a" })]);
    await recordRecentExpenseSearch(ctx, { savedExpenseSearches: repo }, { query: "q=a" }, 5);
    expect(store.size).toBe(2);
    expect(store.get("s1")?.kind).toBe("saved");
  });

  it("6件目を記録すると updatedAt が最古の1件が消え、最大5件に保たれる", async () => {
    const { repo, store } = makeRepo(
      [1, 2, 3, 4, 5].map((n) =>
        row(`r${n}`, { kind: "recent", name: undefined, query: `q=${n}`, updatedAt: n * 10 }),
      ),
    );
    const deps = { savedExpenseSearches: repo };
    await recordRecentExpenseSearch(ctx, deps, { query: "q=6" }, 100);
    expect(store.size).toBe(5);
    expect(store.has("r1")).toBe(false);
    const { recent } = await listSavedExpenseSearches(ctx, deps);
    expect(recent.map((r) => r.query)).toEqual(["q=6", "q=5", "q=4", "q=3", "q=2"]);
  });

  it("他の利用者・他グループの recent は消さない", async () => {
    const others = [
      row("o1", { kind: "recent", userId: "u2", name: undefined, query: "q=x", updatedAt: 1 }),
      row("o2", { kind: "recent", groupId: "g2", name: undefined, query: "q=y", updatedAt: 1 }),
    ];
    const own = [1, 2, 3, 4, 5].map((n) =>
      row(`r${n}`, { kind: "recent", name: undefined, query: `q=${n}`, updatedAt: n * 10 }),
    );
    const { repo, store } = makeRepo([...others, ...own]);
    await recordRecentExpenseSearch(ctx, { savedExpenseSearches: repo }, { query: "q=6" }, 100);
    expect(store.has("o1")).toBe(true);
    expect(store.has("o2")).toBe(true);
  });
});

describe("recordRecentExpenseSearch の並び順", () => {
  it("同時刻（updatedAt が衝突）でも再記録した条件が先頭になる", async () => {
    const { repo } = makeRepo([
      row("A", { kind: "recent", name: undefined, query: "q=a", updatedAt: 100 }),
      row("B", { kind: "recent", name: undefined, query: "q=b", updatedAt: 99 }),
    ]);
    const deps = { savedExpenseSearches: repo };
    await recordRecentExpenseSearch(ctx, deps, { query: "q=b" }, 100);
    const { recent } = await listSavedExpenseSearches(ctx, deps);
    expect(recent.map((r) => r.id)).toEqual(["B", "A"]);
  });

  it("同時刻に新規追加した条件も先頭になる", async () => {
    const { repo } = makeRepo([
      row("A", { kind: "recent", name: undefined, query: "q=a", updatedAt: 100 }),
    ]);
    const deps = { savedExpenseSearches: repo };
    await recordRecentExpenseSearch(ctx, deps, { query: "q=new" }, 100);
    const { recent } = await listSavedExpenseSearches(ctx, deps);
    expect(recent.map((r) => r.query)).toEqual(["q=new", "q=a"]);
  });
});

describe("listSavedExpenseSearches", () => {
  it("自分と現在グループの保存（新しい順）と最近（updatedAt新しい順）だけ返す", async () => {
    const { repo } = makeRepo([
      row("s-old", { createdAt: 1 }),
      row("s-new", { createdAt: 2 }),
      row("s-other-user", { userId: "u2", createdAt: 9 }),
      row("s-other-group", { groupId: "g2", createdAt: 9 }),
      row("r-old", { kind: "recent", name: undefined, updatedAt: 1 }),
      row("r-new", { kind: "recent", name: undefined, updatedAt: 2 }),
      row("r-other-user", { kind: "recent", userId: "u2", name: undefined, updatedAt: 9 }),
    ]);
    const result = await listSavedExpenseSearches(ctx, { savedExpenseSearches: repo });
    expect(result.saved.map((s) => s.id)).toEqual(["s-new", "s-old"]);
    expect(result.recent.map((r) => r.id)).toEqual(["r-new", "r-old"]);
  });

  it("返却項目に userId・groupId を含めない", async () => {
    const { repo } = makeRepo([row("s1")]);
    const result = await listSavedExpenseSearches(ctx, { savedExpenseSearches: repo });
    expect(Object.keys(result.saved[0]).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "query",
      "updatedAt",
    ]);
  });
});

describe("deleteSavedExpenseSearch", () => {
  it("自分の保存条件を削除する", async () => {
    const { repo, store } = makeRepo([row("s1")]);
    await deleteSavedExpenseSearch(ctx, { savedExpenseSearches: repo }, "s1");
    expect(store.has("s1")).toBe(false);
  });

  it("他人・別グループ・存在しないIDは拒否し、対象を残す", async () => {
    const { repo, store } = makeRepo([
      row("other-user", { userId: "u2" }),
      row("other-group", { groupId: "g2" }),
    ]);
    const deps = { savedExpenseSearches: repo };
    for (const id of ["other-user", "other-group", "missing"]) {
      await expect(deleteSavedExpenseSearch(ctx, deps, id)).rejects.toThrow(
        "保存した検索が見つかりません",
      );
    }
    expect(store.has("other-user")).toBe(true);
    expect(store.has("other-group")).toBe(true);
  });
});
