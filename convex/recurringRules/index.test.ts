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
