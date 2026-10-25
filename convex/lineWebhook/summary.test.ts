// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FunctionArgs } from "convex/server";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  LINE_HELP_MESSAGE,
  LINE_NO_GROUP_MESSAGE,
  LINE_RECEIPT_GUIDE_MESSAGE,
  LINE_UNRESOLVED_GROUP_MESSAGE,
} from "../../lib/domain/lineSummary/reply";

const NOW_MS = Date.parse("2026-08-12T12:00:00+09:00");

async function seedLinkedHousehold(
  t: ReturnType<typeof convexTest>,
  options: {
    userId: string;
    lineUserId: string;
    groupName: string;
    active?: boolean;
    extraGroup?: boolean;
  },
) {
  return t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: options.groupName,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherGroupId = await ctx.db.insert("groups", {
      name: `${options.groupName}-other`,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: options.userId,
      displayName: options.userId,
      createdAt: 1,
      updatedAt: 1,
      ...(options.active === false ? {} : { activeGroupId: groupId }),
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: options.userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    if (options.extraGroup) {
      await ctx.db.insert("groupMembers", {
        groupId: otherGroupId,
        userId: options.userId,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const linkId = await ctx.db.insert("lineAccountLinks", {
      userId: options.userId,
      lineUserId: options.lineUserId,
      status: "active",
      linkedAt: 1,
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
    const dailyId = await ctx.db.insert("categories", {
      groupId,
      name: "日用品",
      color: "#0ea5e9",
      isActive: true,
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherFoodId = await ctx.db.insert("categories", {
      groupId: otherGroupId,
      name: "食費",
      color: "#111111",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-08-11",
      amount: 2000,
      categoryId: foodId,
      title: "牛乳",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-08-11",
      amount: 1000,
      categoryId: dailyId,
      title: "洗剤",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-08-11",
      amount: 180000,
      title: "給与",
      entryType: "income",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-08-04",
      amount: 500,
      categoryId: foodId,
      title: "先週のパン",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId,
      date: "2026-07-28",
      amount: 400,
      categoryId: foodId,
      title: "2週前の野菜",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("expenseEntries", {
      groupId: otherGroupId,
      date: "2026-08-11",
      amount: 99999,
      categoryId: otherFoodId,
      title: "別グループの秘密",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, otherGroupId, foodId, linkId };
  });
}

async function queryLinkedSummary(
  t: ReturnType<typeof convexTest>,
  args: { userId: string; messageText: string; nowMs: number },
) {
  const link = await t.run((ctx) =>
    ctx.db
      .query("lineAccountLinks")
      .withIndex("by_user_id_and_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
      .unique(),
  );
  if (link === null) throw new Error("有効リンクのfixtureが必要です");
  const reply = await t.query(internal.lineWebhook.summary.buildReply, {
    ...args,
    linkId: link._id,
    lineUserId: link.lineUserId,
  });
  expect(reply).not.toBeNull();
  if (reply === null) throw new Error("有効リンクには返信が必要です");
  return reply;
}

describe("LINE readonly summary", () => {
  it("連携済みユーザーの今週サマリーは本人のactiveグループだけを返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
      extraGroup: true,
    });
    await seedLinkedHousehold(t, {
      userId: "user-b",
      lineUserId: "line-b",
      groupName: "B家",
    });

    const reply = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "今週",
      nowMs: NOW_MS,
    });

    expect(reply.replyText).toContain("支出: 3,000円");
    expect(reply.replyText).toContain("収入: 180,000円");
    expect(reply.replyText).toContain("食費 2,000円");
    expect(reply.replyText).not.toContain("99,999");
    expect(reply.replyText).not.toContain("別グループの秘密");
  });

  it("解除済みのリンクには返信を作らない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { linkId } = await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
    });
    await t.run((ctx) => ctx.db.patch(linkId, { status: "revoked", revokedAt: 2 }));
    await expect(
      t.query(internal.lineWebhook.summary.buildReply, {
        userId: "user-a",
        linkId,
        lineUserId: "line-a",
        messageText: "今週の支出",
        nowMs: NOW_MS,
      }),
    ).resolves.toBeNull();
  });

  it("コマンドごとに支出・収入・カテゴリ別・週別推移・食費を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
    });

    const expense = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "今週の支出",
      nowMs: NOW_MS,
    });
    const income = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "今週の収入",
      nowMs: NOW_MS,
    });
    const categories = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "カテゴリ別",
      nowMs: NOW_MS,
    });
    const food = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "食費",
      nowMs: NOW_MS,
    });
    const trend = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "週別推移",
      nowMs: NOW_MS,
    });

    expect(expense.replyText).toContain("支出: 3,000円");
    expect(income.replyText).toContain("収入: 180,000円");
    expect(categories.replyText).toContain("食費 2,000円");
    expect(food.replyText).toContain("食費: 2,000円");
    expect(trend.replyText).toContain("直近3週間の支出");
    expect(trend.replyText).toContain("400円");
    expect(trend.replyText).toContain("500円");
    expect(trend.replyText).toContain("3,000円");
    expect(trend.replyText).not.toContain("99,999");
  });

  it("自然文とレシート案内は既存の読み取り専用ロジックへ乗る", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
    });

    const expense = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "今週いくら使った？",
      nowMs: NOW_MS,
    });
    const food = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "食費どれくらい？",
      nowMs: NOW_MS,
    });
    const hello = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "こんにちは",
      nowMs: NOW_MS,
    });
    const receipt = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "レシートを送る",
      nowMs: NOW_MS,
    });

    expect(expense.replyKind).toBe("week_expense");
    expect(expense.replyText).toContain("支出: 3,000円");
    expect(food.replyKind).toBe("category_lookup");
    expect(food.replyText).toContain("食費: 2,000円");
    expect(hello).toEqual({ replyKind: "help", replyText: LINE_HELP_MESSAGE });
    expect(receipt).toEqual({
      replyKind: "receipt_guide",
      replyText: LINE_RECEIPT_GUIDE_MESSAGE,
    });
    expect(receipt.replyText).not.toMatch(/\d+円/);
  });

  it("未知コマンドとグループ未設定・未選択は金額を返さない", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-nogroup",
        lineUserId: "line-nogroup",
        status: "active",
        linkedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId: "user-nogroup",
        displayName: "no-group",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await seedLinkedHousehold(t, {
      userId: "user-multi",
      lineUserId: "line-multi",
      groupName: "複数所属",
      active: false,
      extraGroup: true,
    });

    const unknown = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "旅行",
      nowMs: NOW_MS,
    });
    const help = await queryLinkedSummary(t, {
      userId: "user-a",
      messageText: "ヘルプ",
      nowMs: NOW_MS,
    });
    const noGroup = await queryLinkedSummary(t, {
      userId: "user-nogroup",
      messageText: "今週の支出",
      nowMs: NOW_MS,
    });
    const unresolved = await queryLinkedSummary(t, {
      userId: "user-multi",
      messageText: "今週の支出",
      nowMs: NOW_MS,
    });

    expect(unknown.replyText).toBe(LINE_HELP_MESSAGE);
    expect(unknown.replyText).not.toMatch(/\d+円/);
    expect(help.replyText).toBe(LINE_HELP_MESSAGE);
    expect(noGroup.replyText).toBe(LINE_NO_GROUP_MESSAGE);
    expect(unresolved.replyText).toBe(LINE_UNRESOLVED_GROUP_MESSAGE);
  });

  it("データが無い週は専用の空メッセージを返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "空グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId: "user-empty",
        displayName: "empty",
        createdAt: 1,
        updatedAt: 1,
        activeGroupId: groupId,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "user-empty",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-empty",
        lineUserId: "line-empty",
        status: "active",
        linkedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const reply = await queryLinkedSummary(t, {
      userId: "user-empty",
      messageText: "今週",
      nowMs: NOW_MS,
    });
    expect(reply.replyText).toBe("今週（2026-08-10〜2026-08-16）の家計データはありません。");
  });

  it("日曜の当日支出は今週サマリーの合計に含まれ、前後の週は含めない", async () => {
    const t = convexTest(schema, convexTestModules);
    const sundayNowMs = Date.parse("2026-08-16T12:00:00+09:00");
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "日曜グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId: "user-sunday",
        displayName: "sunday",
        createdAt: 1,
        updatedAt: 1,
        activeGroupId: groupId,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "user-sunday",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-sunday",
        lineUserId: "line-sunday",
        status: "active",
        linkedAt: 1,
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
        date: "2026-08-16",
        amount: 1234,
        categoryId: foodId,
        title: "当日の弁当",
        entryType: "expense",
        source: "manual",
        createdAt: sundayNowMs,
        updatedAt: sundayNowMs,
      });
      await ctx.db.insert("expenseEntries", {
        groupId,
        date: "2026-08-09",
        amount: 9999,
        categoryId: foodId,
        title: "前週の弁当",
        entryType: "expense",
        source: "manual",
        createdAt: sundayNowMs,
        updatedAt: sundayNowMs,
      });
      await ctx.db.insert("expenseEntries", {
        groupId,
        date: "2026-08-17",
        amount: 8888,
        categoryId: foodId,
        title: "翌週の弁当",
        entryType: "expense",
        source: "manual",
        createdAt: sundayNowMs,
        updatedAt: sundayNowMs,
      });
    });

    const reply = await queryLinkedSummary(t, {
      userId: "user-sunday",
      messageText: "今週",
      nowMs: sundayNowMs,
    });

    expect(reply.replyText).toContain("今週（2026-08-10〜2026-08-16）");
    expect(reply.replyText).toContain("支出: 1,234円");
    expect(reply.replyText).not.toContain("9,999");
    expect(reply.replyText).not.toContain("8,888");
    expect(reply.replyText).not.toContain("当日の弁当");
  });

  it("グループ文書が無い所属だけでは家計金額を返さない", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "消えるグループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId: "user-orphan",
        displayName: "orphan",
        createdAt: 1,
        updatedAt: 1,
        activeGroupId: groupId,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "user-orphan",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-orphan",
        lineUserId: "line-orphan",
        status: "active",
        linkedAt: 1,
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
        date: "2026-08-11",
        amount: 7777,
        categoryId: foodId,
        title: "残存支出",
        entryType: "expense",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(groupId);
    });

    const reply = await queryLinkedSummary(t, {
      userId: "user-orphan",
      messageText: "今週",
      nowMs: NOW_MS,
    });
    expect(reply.replyText).toBe(LINE_NO_GROUP_MESSAGE);
    expect(reply.replyText).not.toContain("7,777");
    expect(reply.replyText).not.toMatch(/\d+円/);
  });
});

describe("予約時のリンクに基づくサマリー返信", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function claimSummary(t: ReturnType<typeof convexTest>) {
    const { linkId } = await seedLinkedHousehold(t, {
      userId: "user-a",
      lineUserId: "line-a",
      groupName: "A家",
    });
    await t.mutation(internal.lineWebhook.internal.claimEvents, {
      events: [
        {
          webhookEventId: "summary-event",
          eventType: "text",
          lineUserId: "line-a",
          messageText: "今週",
          replyToken: "reply-token",
          eventTimestamp: NOW_MS,
        },
      ],
    });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(1);
    const args = jobs[0].args[0] as FunctionArgs<
      typeof internal.lineWebhook.actions.sendSummaryReply
    >;
    expect(args).toEqual({
      userId: "user-a",
      linkId,
      lineUserId: "line-a",
      replyToken: "reply-token",
      messageText: "今週",
      nowMs: NOW_MS,
    });
    return { linkId, args };
  }

  function mockReply() {
    vi.useFakeTimers();
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "test-access-token");
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    return fetchImpl;
  }

  it.each(["有効", "解除", "別アカウントへの変更", "同じアカウントへの再連携", "所有者の変更"])(
    "%sの場合に予約時のリンクで返信可否を決める",
    async (state) => {
      const t = convexTest(schema, convexTestModules);
      const fetchImpl = mockReply();
      const { linkId, args } = await claimSummary(t);
      if (state !== "有効") {
        await t.run(async (ctx) => {
          if (state === "所有者の変更") {
            await ctx.db.patch(linkId, { userId: "user-b" });
            return;
          }
          await ctx.db.patch(linkId, { status: "revoked", revokedAt: 2 });
          if (state === "解除") return;
          await ctx.db.insert("lineAccountLinks", {
            userId: "user-a",
            lineUserId: state === "同じアカウントへの再連携" ? "line-a" : "line-b",
            status: "active",
            linkedAt: 2,
            createdAt: 2,
            updatedAt: 2,
          });
        });
      }
      await expect(
        t.action(internal.lineWebhook.actions.sendSummaryReply, args),
      ).resolves.toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(state === "有効" ? 1 : 0);
      if (state === "有効") {
        expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toMatchObject({
          replyToken: "reply-token",
          messages: [{ text: expect.stringContaining("支出: 3,000円") }],
        });
      }
    },
  );

  it("予約済みの旧形式は受け付け、返信しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const fetchImpl = mockReply();
    const { args } = await claimSummary(t);
    const { linkId: _linkId, lineUserId: _lineUserId, ...legacyArgs } = args;
    await expect(
      t.action(internal.lineWebhook.actions.sendSummaryReply, legacyArgs),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("再試行も予約時のリンクを保持し、解除後は返信しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const fetchImpl = mockReply();
    fetchImpl.mockRejectedValueOnce(new Error("provider unavailable"));
    const { linkId, args } = await claimSummary(t);
    await t.action(internal.lineWebhook.actions.sendSummaryReply, args);
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(2);
    const retryArgs = jobs[1].args[0] as FunctionArgs<
      typeof internal.lineWebhook.actions.sendSummaryReply
    >;
    expect(retryArgs).toEqual({ ...args, attempt: 1 });
    await t.run((ctx) => ctx.db.patch(linkId, { status: "revoked", revokedAt: 2 }));
    await t.action(internal.lineWebhook.actions.sendSummaryReply, retryArgs);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const finalJobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(finalJobs).toHaveLength(2);
  });
});
