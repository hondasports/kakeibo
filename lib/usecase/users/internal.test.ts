import { describe, expect, it } from "vitest";
import type { NewUserFields, UserPatch, UserRecord, UserStore } from "../../domain/users/store";
import {
  clearUserMonthlyIncome,
  getUserById,
  getUserIdByEmail,
  upsertUserProfile,
} from "./internal";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "id1",
    creationTime: 0,
    userId: "u1",
    displayName: "名前",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeStore(userByUserId: UserRecord | null, userByEmail: UserRecord | null = null) {
  const calls: { inserts: NewUserFields[]; patches: { id: string; patch: UserPatch }[] } = {
    inserts: [],
    patches: [],
  };
  const store: UserStore = {
    findByUserId: async () => userByUserId,
    findByEmail: async () => userByEmail,
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

describe("upsertUserProfile", () => {
  it("既存が無ければ insert する（email は trim+小文字化のみで空文字を保持する）", async () => {
    const { store, calls } = makeStore(null);
    await upsertUserProfile(store, { userId: "u1", displayName: "  ", email: "  " }, 100);
    expect(calls.inserts).toEqual([
      {
        userId: "u1",
        displayName: "ユーザー",
        email: "",
        createdAt: 100,
        updatedAt: 100,
      },
    ]);
  });

  it("displayName 空 + email ありなら email が名前になる", async () => {
    const { store, calls } = makeStore(null);
    await upsertUserProfile(store, { userId: "u1", displayName: " ", email: "E@x.com" }, 0);
    expect(calls.inserts[0].displayName).toBe("e@x.com");
  });

  it("既存があれば patch する。email 未指定なら既存値を維持する", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1", email: "keep@x.com" }));
    await upsertUserProfile(store, { userId: "u1", displayName: "新" }, 50);
    expect(calls.patches).toEqual([
      { id: "ex1", patch: { displayName: "新", email: "keep@x.com", updatedAt: 50 } },
    ]);
  });
});

describe("getUserIdByEmail", () => {
  it("空文字・空白のみなら null", async () => {
    const { store } = makeStore(null);
    expect(await getUserIdByEmail(store, "   ")).toBeNull();
  });

  it("正規化して検索し userId を返す", async () => {
    let queried: string | undefined;
    const store: Pick<UserStore, "findByEmail"> = {
      findByEmail: async (email) => {
        queried = email;
        return makeUser({ userId: "found" });
      },
    };
    expect(await getUserIdByEmail(store, " A@X.com ")).toBe("found");
    expect(queried).toBe("a@x.com");
  });
});

describe("getUserById", () => {
  it("不在なら null、在れば要約を返す", async () => {
    expect(await getUserById(makeStore(null).store, "u1")).toBeNull();
    expect(
      await getUserById(makeStore(makeUser({ email: "e@x.com", displayName: "名" })).store, "u1"),
    ).toEqual({ userId: "u1", email: "e@x.com", displayName: "名" });
  });
});

describe("clearUserMonthlyIncome", () => {
  it("不在なら cleared:false、在れば monthlyIncome を undefined で patch", async () => {
    expect(await clearUserMonthlyIncome(makeStore(null).store, "u1", 0)).toEqual({
      cleared: false,
    });
    const { store, calls } = makeStore(makeUser({ id: "ex1", monthlyIncome: 5 }));
    expect(await clearUserMonthlyIncome(store, "u1", 99)).toEqual({ cleared: true });
    expect(calls.patches).toEqual([
      { id: "ex1", patch: { monthlyIncome: undefined, updatedAt: 99 } },
    ]);
  });
});
