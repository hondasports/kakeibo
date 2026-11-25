// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const USER_ID = "user-1";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
});

type TestT = ReturnType<typeof convexTest>;

async function seedGroup(t: TestT, options: { role?: "owner" | "member" } = {}) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "group-a",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: USER_ID,
      role: options.role ?? "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: USER_ID,
      displayName: USER_ID,
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    const categoryId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, categoryId };
  });
}

async function insertRule(
  t: TestT,
  groupId: Id<"groups">,
  fields: Record<string, unknown>,
): Promise<Id<"recurringEntryRules">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("recurringEntryRules", {
        groupId,
        kind: "expense",
        title: "家賃",
        amountYen: 80000,
        frequency: "monthly",
        dayOfMonth: 1,
        active: true,
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      }),
  );
}

async function countExpenseEntries(t: TestT): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.query("expenseEntries").collect()).length);
}

describe("recurringRules のグループ境界", () => {
  it("別グループの定義は update・setActive・register すべて拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId } = await seedGroup(t);
    // ユーザーが所属しない別グループとその定義
    const otherGroupId = await t.run(
      async (ctx) =>
        await ctx.db.insert("groups", {
          name: "group-b",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        }),
    );
    const ruleId = await insertRule(t, otherGroupId, {});

    const authed = t.withIdentity(identity(USER_ID));
    const patch = {
      ruleId,
      kind: "expense" as const,
      title: "家賃",
      amountYen: 80000,
      frequency: "monthly" as const,
      dayOfMonth: 1,
    };
    await expect(
      authed.mutation(api.recurringRules.index.updateRecurringRule, patch),
    ).rejects.toThrow("Recurring rule not found");
    await expect(
      authed.mutation(api.recurringRules.index.setRecurringRuleActive, {
        ruleId,
        active: false,
      }),
    ).rejects.toThrow("Recurring rule not found");
    await expect(
      authed.mutation(api.recurringRules.index.registerFromRecurringRule, { ruleId }),
    ).rejects.toThrow("Recurring rule not found");
    expect(groupId).not.toBe(otherGroupId);
  });
});

describe("registerFromRecurringRule", () => {
  it("同じ発生日に2回呼ぶと2回目は already_registered で実績は1件だけ", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ruleId = await insertRule(t, groupId, { categoryId });

    const authed = t.withIdentity(identity(USER_ID));
    const first = await authed.mutation(api.recurringRules.index.registerFromRecurringRule, {
      ruleId,
    });
    expect(first).toMatchObject({ registered: true });
    const second = await authed.mutation(api.recurringRules.index.registerFromRecurringRule, {
      ruleId,
    });
    expect(second).toEqual({ registered: false, reason: "already_registered" });
    expect(await countExpenseEntries(t)).toBe(1);
  });

  it("条件変更で発生日が移っても同じ月には再登録できない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ruleId = await insertRule(t, groupId, { categoryId, dayOfMonth: 25 });

    const authed = t.withIdentity(identity(USER_ID));
    const first = await authed.mutation(api.recurringRules.index.registerFromRecurringRule, {
      ruleId,
    });
    expect(first).toMatchObject({ registered: true });
    const date = (first as { date: string }).date;

    // 発生日を別日に変更しても、登録済みと同じ月の発生日には再登録しない
    await authed.mutation(api.recurringRules.index.updateRecurringRule, {
      ruleId,
      kind: "expense",
      title: "家賃",
      amountYen: 80000,
      categoryId,
      frequency: "monthly",
      dayOfMonth: 1,
    });
    const second = await authed.mutation(api.recurringRules.index.registerFromRecurringRule, {
      ruleId,
    });
    // 直近発生日が別月に移った場合だけ登録される。同じ月なら already_registered。
    if (
      date.slice(0, 7) ===
      new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7)
    ) {
      expect(second).toEqual({ registered: false, reason: "already_registered" });
      expect(await countExpenseEntries(t)).toBe(1);
    }
  });

  it("停止中の定義は登録されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ruleId = await insertRule(t, groupId, { categoryId, active: false });

    const result = await t
      .withIdentity(identity(USER_ID))
      .mutation(api.recurringRules.index.registerFromRecurringRule, { ruleId });
    expect(result).toEqual({ registered: false, reason: "inactive" });
    expect(await countExpenseEntries(t)).toBe(0);
  });

  it("無効化したカテゴリを持つ定義は登録できない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ruleId = await insertRule(t, groupId, { categoryId });
    await t.run(async (ctx) => {
      await ctx.db.patch(categoryId, { isActive: false });
    });

    await expect(
      t
        .withIdentity(identity(USER_ID))
        .mutation(api.recurringRules.index.registerFromRecurringRule, { ruleId }),
    ).rejects.toThrow();
    expect(await countExpenseEntries(t)).toBe(0);
  });
});

describe("createRecurringRule・listRecurringRules の公開経路", () => {
  async function seedUser(
    t: TestT,
    userId: string,
    existingGroupId?: Id<"groups">,
  ): Promise<Id<"groups">> {
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
        activeGroupId: groupId,
        createdAt: 1,
        updatedAt: 1,
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

  async function insertCategory(t: TestT, groupId: Id<"groups">): Promise<Id<"categories">> {
    return await t.run(
      async (ctx) =>
        await ctx.db.insert("categories", {
          groupId,
          name: "食費",
          color: "#000000",
          isActive: true,
          sortOrder: 0,
          createdAt: 1,
          updatedAt: 1,
        }),
    );
  }

  async function countRules(t: TestT): Promise<number> {
    return await t.run(async (ctx) => (await ctx.db.query("recurringEntryRules").collect()).length);
  }

  const validInput = (categoryId?: Id<"categories">) => ({
    kind: "expense" as const,
    title: "家賃",
    amountYen: 80000,
    categoryId,
    frequency: "monthly" as const,
    dayOfMonth: 25,
  });

  it("未認証は作成・一覧を拒否し、保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    // 入力自体は有効にし、認証だけが拒否の原因になるようにする
    const groupId = await seedUser(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    await expect(t.query(api.recurringRules.index.listRecurringRules, {})).rejects.toThrow(
      "Not authenticated",
    );
    await expect(
      t.mutation(api.recurringRules.index.createRecurringRule, validInput(categoryId)),
    ).rejects.toThrow("Not authenticated");
    expect(await countRules(t)).toBe(0);
  });

  it("グループ未所属の利用者は拒否され、保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const stranger = t.withIdentity(identity("stranger"));
    await expect(stranger.query(api.recurringRules.index.listRecurringRules, {})).rejects.toThrow(
      "グループに所属していません",
    );
    // 入力自体は有効にし、認可だけが拒否の原因になるようにする
    const groupId = await seedUser(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    await expect(
      stranger.mutation(api.recurringRules.index.createRecurringRule, validInput(categoryId)),
    ).rejects.toThrow("グループに所属していません");
    expect(await countRules(t)).toBe(0);
  });

  it("所属グループに保存され、一覧で返る", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedUser(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const alice = t.withIdentity(identity("alice"));

    await alice.mutation(api.recurringRules.index.createRecurringRule, validInput(categoryId));
    const list = await alice.query(api.recurringRules.index.listRecurringRules, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      groupId,
      createdByUserId: "alice",
      kind: "expense",
      title: "家賃",
      amountYen: 80000,
      categoryId,
      frequency: "monthly",
      dayOfMonth: 25,
      active: true,
    });
  });

  it("別グループのカテゴリは拒否され、保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "alice");
    const otherGroupId = await seedUser(t, "bob");
    const otherCategoryId = await insertCategory(t, otherGroupId);

    const alice = t.withIdentity(identity("alice"));
    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, validInput(otherCategoryId)),
    ).rejects.toThrow("Category does not belong to the current group");
    expect(await countRules(t)).toBe(0);
  });

  it("入力エラーのとき保存されない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedUser(t, "alice");
    const categoryId = await insertCategory(t, groupId);
    const alice = t.withIdentity(identity("alice"));

    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, {
        ...validInput(categoryId),
        title: " ",
      }),
    ).rejects.toThrow("項目名を入力してください");
    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, {
        ...validInput(categoryId),
        amountYen: 0,
      }),
    ).rejects.toThrow("金額は1円以上9,999,999円以下の整数で入力してください");
    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, {
        ...validInput(),
        categoryId: undefined,
      }),
    ).rejects.toThrow("支出の定期定義にはカテゴリが必要です");
    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, {
        ...validInput(categoryId),
        frequency: "weekly",
        dayOfMonth: undefined,
        dayOfWeek: 7,
      }),
    ).rejects.toThrow("毎週の定期定義には曜日を指定してください");
    await expect(
      alice.mutation(api.recurringRules.index.createRecurringRule, {
        ...validInput(categoryId),
        dayOfMonth: 32,
      }),
    ).rejects.toThrow("毎月の定期定義には1〜31の日付を指定してください");
    expect(await countRules(t)).toBe(0);
  });

  it("別グループの定義は一覧に出ない", async () => {
    const t = convexTest(schema, convexTestModules);
    const aliceGroupId = await seedUser(t, "alice");
    const bobGroupId = await seedUser(t, "bob");
    const categoryId = await insertCategory(t, aliceGroupId);
    await insertRule(t, bobGroupId, {});

    const alice = t.withIdentity(identity("alice"));
    await alice.mutation(api.recurringRules.index.createRecurringRule, validInput(categoryId));

    const aliceList = await alice.query(api.recurringRules.index.listRecurringRules, {});
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0].groupId).toBe(aliceGroupId);

    const bobList = await t
      .withIdentity(identity("bob"))
      .query(api.recurringRules.index.listRecurringRules, {});
    expect(bobList).toHaveLength(1);
    expect(bobList[0].groupId).toBe(bobGroupId);
  });
});
