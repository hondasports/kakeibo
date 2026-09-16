import { describe, expect, it } from "vitest";
import type {
  NewWeekSessionFields,
  WeekSessionPatch,
  WeekSessionRecord,
  WeekSessionStore,
} from "../../domain/weekSessions/store";
import {
  completeWeekSession,
  getOrCreateWeekSession,
  getWeekSession,
  resetWeekSession,
  updateReviewMemo,
} from "./operations";

function makeSession(overrides: Partial<WeekSessionRecord> = {}): WeekSessionRecord {
  return {
    id: "s1",
    creationTime: 0,
    groupId: "g1",
    weekStartDate: "2024-01-08",
    weekEndDate: "2024-01-14",
    status: "draft",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeStore(opts: { found?: WeekSessionRecord | null; got?: WeekSessionRecord | null }) {
  const calls: {
    finds: [string, string][];
    inserts: NewWeekSessionFields[];
    patches: { id: string; patch: WeekSessionPatch }[];
    gets: string[];
  } = { finds: [], inserts: [], patches: [], gets: [] };
  const store: WeekSessionStore = {
    findByGroupAndWeekStart: async (g, w) => {
      calls.finds.push([g, w]);
      return opts.found ?? null;
    },
    get: async (id) => {
      calls.gets.push(id);
      return opts.got === undefined ? null : opts.got;
    },
    insert: async (fields) => {
      calls.inserts.push(fields);
      return "newId";
    },
    patch: async (id, patch) => {
      calls.patches.push({ id, patch });
    },
  };
  return { store, calls };
}

const now = () => 500;

describe("getOrCreateWeekSession", () => {
  it("既存があれば insert せず返す", async () => {
    const existing = makeSession();
    const { store, calls } = makeStore({ found: existing });
    expect(await getOrCreateWeekSession(store, "g1", "2024-01-08", now)).toBe(existing);
    expect(calls.inserts).toEqual([]);
  });

  it("無ければ weekEndDate を計算して insert し get で返す", async () => {
    const created = makeSession({ id: "newId" });
    const { store, calls } = makeStore({ found: null, got: created });
    expect(await getOrCreateWeekSession(store, "g1", "2024-01-08", now)).toBe(created);
    expect(calls.inserts).toEqual([
      {
        groupId: "g1",
        weekStartDate: "2024-01-08",
        weekEndDate: "2024-01-14",
        status: "draft",
        createdAt: 500,
        updatedAt: 500,
      },
    ]);
    expect(calls.gets).toEqual(["newId"]);
  });

  it("insert 後の get が null なら created 文言で失敗する", async () => {
    const { store } = makeStore({ found: null, got: null });
    await expect(getOrCreateWeekSession(store, "g1", "2024-01-08", now)).rejects.toThrow(
      "Failed to retrieve created week session",
    );
  });
});

describe("updateReviewMemo", () => {
  it("無ければ Week session not found", async () => {
    const { store } = makeStore({ found: null });
    await expect(
      updateReviewMemo(store, "g1", { weekStartDate: "2024-01-08", reviewMemo: "m" }, now),
    ).rejects.toThrow("Week session not found");
  });

  it("patch して get で返す", async () => {
    const updated = makeSession({ reviewMemo: "m" });
    const { store, calls } = makeStore({ found: makeSession(), got: updated });
    expect(
      await updateReviewMemo(store, "g1", { weekStartDate: "2024-01-08", reviewMemo: "m" }, now),
    ).toBe(updated);
    expect(calls.patches).toEqual([{ id: "s1", patch: { reviewMemo: "m", updatedAt: 500 } }]);
  });

  it("get が null なら updated 文言で失敗する", async () => {
    const { store } = makeStore({ found: makeSession(), got: null });
    await expect(
      updateReviewMemo(store, "g1", { weekStartDate: "2024-01-08", reviewMemo: "m" }, now),
    ).rejects.toThrow("Failed to retrieve updated week session");
  });
});

describe("completeWeekSession", () => {
  it("reviewMemo 未指定なら patch にキーを含めない", async () => {
    const done = makeSession({ status: "completed" });
    const { store, calls } = makeStore({ found: makeSession(), got: done });
    expect(await completeWeekSession(store, "g1", { weekStartDate: "2024-01-08" }, now)).toBe(done);
    expect(calls.patches[0].patch).toEqual({ status: "completed", updatedAt: 500 });
    expect("reviewMemo" in calls.patches[0].patch).toBe(false);
  });

  it("reviewMemo 指定時は patch に含める", async () => {
    const { store, calls } = makeStore({ found: makeSession(), got: makeSession() });
    await completeWeekSession(store, "g1", { weekStartDate: "2024-01-08", reviewMemo: "x" }, now);
    expect(calls.patches[0].patch).toEqual({
      status: "completed",
      updatedAt: 500,
      reviewMemo: "x",
    });
  });

  it("無ければ Week session not found", async () => {
    const { store } = makeStore({ found: null });
    await expect(
      completeWeekSession(store, "g1", { weekStartDate: "2024-01-08" }, now),
    ).rejects.toThrow("Week session not found");
  });
});

describe("resetWeekSession", () => {
  it("無ければ reset:false", async () => {
    const { store, calls } = makeStore({ found: null });
    expect(await resetWeekSession(store, "g1", "2024-01-08", now)).toEqual({ reset: false });
    expect(calls.patches).toEqual([]);
  });

  it("あれば draft へ戻し reviewMemo を undefined でクリアして reset:true", async () => {
    const { store, calls } = makeStore({ found: makeSession({ status: "completed" }) });
    expect(await resetWeekSession(store, "g1", "2024-01-08", now)).toEqual({ reset: true });
    expect(calls.patches).toEqual([
      { id: "s1", patch: { status: "draft", reviewMemo: undefined, updatedAt: 500 } },
    ]);
    expect("reviewMemo" in calls.patches[0].patch).toBe(true);
  });
});

describe("getWeekSession", () => {
  it("groupId と weekStartDate で検索した結果をそのまま返す", async () => {
    const found = makeSession();
    const { store, calls } = makeStore({ found });
    expect(await getWeekSession(store, "g1", "2024-01-08")).toBe(found);
    expect(calls.finds).toEqual([["g1", "2024-01-08"]]);
    expect(await getWeekSession(makeStore({ found: null }).store, "g1", "x")).toBeNull();
  });
});
