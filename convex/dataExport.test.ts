// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "出力グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherGroupId = await ctx.db.insert("groups", {
      name: "別グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: "export-user",
      displayName: "出力ユーザー",
      createdAt: 1,
      updatedAt: 1,
      activeGroupId: groupId,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: "export-user",
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const foodId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#f97316",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-06-15",
      amount: 1200,
      categoryId: foodId,
      title: "スーパー北浜",
      memo: "週末まとめ買い",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-06-01",
      amount: 180000,
      title: "給与",
      entryType: "income",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-07-05",
      amount: 800,
      categoryId: foodId,
      title: "ドラッグストア",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    // 旧形式（receipts）の明細も出力対象
    await ctx.db.insert("receipts", {
      groupId,
      date: "2026-06-10",
      amountYen: 540,
      categoryId: foodId,
      shopName: "セブンイレブン",
      weekStartDate: "2026-06-08",
      type: "expense",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId: otherGroupId,
      date: "2026-06-15",
      amount: 9999,
      title: "別グループ店",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId };
  });
}

describe("listExportEntries", () => {
  it("期間内の支出・収入を新旧sourceから日付昇順で返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const authed = t.withIdentity(identity("export-user"));

    const result = await authed.query(api.dataExport.listExportEntries, {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });

    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => [row.date, row.kind, row.title, row.amountYen])).toEqual([
      ["2026-06-01", "income", "給与", 180000],
      ["2026-06-10", "expense", "セブンイレブン", 540],
      ["2026-06-15", "expense", "スーパー北浜", 1200],
    ]);
    expect(result.rows[2]).toMatchObject({ categoryName: "食費", memo: "週末まとめ買い" });
  });

  it("entryTypeで支出・収入を絞り込める", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const authed = t.withIdentity(identity("export-user"));

    const expenses = await authed.query(api.dataExport.listExportEntries, {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      entryType: "expense",
    });
    expect(expenses.rows.every((row) => row.kind === "expense")).toBe(true);
    expect(expenses.rows).toHaveLength(2);

    const incomes = await authed.query(api.dataExport.listExportEntries, {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      entryType: "income",
    });
    expect(incomes.rows).toEqual([
      expect.objectContaining({ date: "2026-06-01", kind: "income", title: "給与" }),
    ]);
  });

  it("期間外・別グループの明細は含まない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const authed = t.withIdentity(identity("export-user"));

    const result = await authed.query(api.dataExport.listExportEntries, {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
    expect(result.rows).toEqual([
      expect.objectContaining({ date: "2026-07-05", title: "ドラッグストア" }),
    ]);
  });

  it("日付形式と期間逆転を弾く", async () => {
    const t = convexTest(schema, convexTestModules);
    await seed(t);
    const authed = t.withIdentity(identity("export-user"));

    await expect(
      authed.query(api.dataExport.listExportEntries, {
        startDate: "2026/06/01",
        endDate: "2026-06-30",
      }),
    ).rejects.toThrow("期間はYYYY-MM-DD形式で指定してください");
    await expect(
      authed.query(api.dataExport.listExportEntries, {
        startDate: "2026-06-30",
        endDate: "2026-06-01",
      }),
    ).rejects.toThrow("開始日は終了日以前の日付を指定してください");
  });
});
