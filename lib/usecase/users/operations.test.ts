import { describe, expect, it } from "vitest";
import type { NewUserFields, UserPatch, UserRecord, UserStore } from "../../domain/users/store";
import {
  acceptReceiptImageExternalApiConsent,
  updateMonthlyIncome,
  updateWeeklyDays,
  upsertUser,
} from "./operations";
import { getReceiptImageConsent, getUserProfile } from "./queries";
import { getWeeklyStartDayForUser } from "./weeklySettings";

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

function makeStore(user: UserRecord | null) {
  const calls: { inserts: NewUserFields[]; patches: { id: string; patch: UserPatch }[] } = {
    inserts: [],
    patches: [],
  };
  const store: UserStore = {
    findByUserId: async () => user,
    findByEmail: async () => null,
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

describe("upsertUser", () => {
  it("既存が無ければ insert する", async () => {
    const { store, calls } = makeStore(null);
    await upsertUser(store, { userId: "u1", name: "新", email: "A@x.com" }, 100);
    expect(calls.inserts).toEqual([
      {
        userId: "u1",
        displayName: "新",
        email: "a@x.com",
        createdAt: 100,
        updatedAt: 100,
      },
    ]);
    expect(calls.patches).toEqual([]);
  });

  it("既存があれば patch する", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1", displayName: "旧" }));
    await upsertUser(store, { userId: "u1", name: "新" }, 100);
    expect(calls.inserts).toEqual([]);
    expect(calls.patches).toEqual([
      { id: "ex1", patch: { displayName: "新", email: undefined, updatedAt: 100 } },
    ]);
  });
});

describe("acceptReceiptImageExternalApiConsent", () => {
  it("未設定なら now を書き込む", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1" }));
    await acceptReceiptImageExternalApiConsent(store, "u1", 200);
    expect(calls.patches).toEqual([
      {
        id: "ex1",
        patch: { receiptImageExternalApiConsentAcceptedAt: 200, updatedAt: 200 },
      },
    ]);
  });

  it("既設定なら既存時刻を保持する（冪等）", async () => {
    const { store, calls } = makeStore(
      makeUser({ id: "ex1", receiptImageExternalApiConsentAcceptedAt: 50 }),
    );
    await acceptReceiptImageExternalApiConsent(store, "u1", 200);
    expect(calls.patches[0].patch.receiptImageExternalApiConsentAcceptedAt).toBe(50);
  });

  it("ユーザー不在なら User not found", async () => {
    const { store } = makeStore(null);
    await expect(acceptReceiptImageExternalApiConsent(store, "u1", 200)).rejects.toThrow(
      "User not found",
    );
  });
});

describe("updateMonthlyIncome", () => {
  it("整数なら patch する", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1" }));
    await updateMonthlyIncome(store, "u1", 300000, 100);
    expect(calls.patches).toEqual([
      { id: "ex1", patch: { monthlyIncome: 300000, updatedAt: 100 } },
    ]);
  });

  it("null なら undefined でクリアする", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1", monthlyIncome: 1 }));
    await updateMonthlyIncome(store, "u1", null, 100);
    expect(calls.patches[0].patch.monthlyIncome).toBeUndefined();
    expect("monthlyIncome" in calls.patches[0].patch).toBe(true);
  });

  it("負数・小数はエラー", async () => {
    const { store } = makeStore(makeUser());
    await expect(updateMonthlyIncome(store, "u1", -1, 0)).rejects.toThrow(
      "月収入は0以上の整数で入力してください",
    );
    await expect(updateMonthlyIncome(store, "u1", 1.5, 0)).rejects.toThrow(
      "月収入は0以上の整数で入力してください",
    );
  });
});

describe("updateWeeklyDays", () => {
  it("weeklyEndDay は開始曜日から導出して保存する", async () => {
    const { store, calls } = makeStore(makeUser({ id: "ex1" }));
    await updateWeeklyDays(store, "u1", { weeklyStartDay: 3, weeklyEndDay: 0 }, 100);
    expect(calls.patches).toEqual([
      { id: "ex1", patch: { weeklyStartDay: 3, weeklyEndDay: 2, updatedAt: 100 } },
    ]);
  });

  it("範囲外の開始曜日・終了曜日はエラー", async () => {
    const { store } = makeStore(makeUser());
    await expect(
      updateWeeklyDays(store, "u1", { weeklyStartDay: 7, weeklyEndDay: 0 }, 0),
    ).rejects.toThrow("週の開始曜日は0〜6の整数で入力してください");
    await expect(
      updateWeeklyDays(store, "u1", { weeklyStartDay: 0, weeklyEndDay: 7 }, 0),
    ).rejects.toThrow("週の終了曜日は0〜6の整数で入力してください");
  });
});

describe("getUserProfile", () => {
  it("ユーザー不在なら undefined", async () => {
    const { store } = makeStore(null);
    expect(await getUserProfile(store, "u1")).toBeUndefined();
  });

  it("weeklyEndDay は weeklyStartDay から導出する", async () => {
    const { store } = makeStore(makeUser({ monthlyIncome: 100, weeklyStartDay: 6 }));
    expect(await getUserProfile(store, "u1")).toEqual({
      monthlyIncome: 100,
      weeklyStartDay: 6,
      weeklyEndDay: 5,
    });
  });

  it("未設定項目はデフォルトへ正規化する", async () => {
    const { store } = makeStore(makeUser());
    expect(await getUserProfile(store, "u1")).toEqual({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });
  });
});

describe("getReceiptImageConsent", () => {
  it("ユーザー不在でも未承認として返す", async () => {
    const { store } = makeStore(null);
    expect(await getReceiptImageConsent(store, "u1")).toEqual({
      hasAcceptedExternalApiConsent: false,
      acceptedAt: null,
    });
  });

  it("承認済みなら時刻を返す", async () => {
    const { store } = makeStore(makeUser({ receiptImageExternalApiConsentAcceptedAt: 123 }));
    expect(await getReceiptImageConsent(store, "u1")).toEqual({
      hasAcceptedExternalApiConsent: true,
      acceptedAt: 123,
    });
  });
});

describe("getWeeklyStartDayForUser", () => {
  it("設定値を返し、未設定・不正値は月曜へ正規化する", async () => {
    expect(
      await getWeeklyStartDayForUser(makeStore(makeUser({ weeklyStartDay: 5 })).store, "u1"),
    ).toBe(5);
    expect(await getWeeklyStartDayForUser(makeStore(null).store, "u1")).toBe(1);
    expect(
      await getWeeklyStartDayForUser(makeStore(makeUser({ weeklyStartDay: 9 })).store, "u1"),
    ).toBe(1);
  });
});
