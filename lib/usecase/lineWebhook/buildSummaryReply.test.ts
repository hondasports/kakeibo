import { describe, expect, it, vi } from "vitest";
import type { LineAccountLinkRecord } from "../../domain/lineLink/records";
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";
import { buildSummaryReply, type BuildSummaryReplyDeps } from "./buildSummaryReply";

const originalLink: LineAccountLinkRecord = {
  id: "link-a",
  userId: "user-a",
  lineUserId: "line-a",
  status: "active",
  linkedAt: 100,
  createdAt: 100,
  updatedAt: 100,
};
const args = {
  userId: "user-a",
  linkId: "link-a",
  lineUserId: "line-a",
  messageText: "今週",
  nowMs: Date.parse("2026-08-12T12:00:00+09:00"),
};

function createDeps(links: LineAccountLinkRecord[]): BuildSummaryReplyDeps {
  return {
    accountLinks: {
      listActiveByLineUserId: vi.fn().mockResolvedValue(links),
      listActiveByUserId: vi.fn().mockResolvedValue(links),
    },
    activeGroup: { resolve: vi.fn().mockResolvedValue({ status: "resolved", groupId: "group-a" }) },
    groups: { get: vi.fn().mockResolvedValue({ id: "group-a", status: "active" }) },
    userSettings: { resolveWeeklyStartDay: vi.fn().mockResolvedValue(1) },
    summaryData: {
      getWeekSpendingEntries: vi.fn().mockResolvedValue([]),
      getWeekIncomeEntries: vi.fn().mockResolvedValue([]),
      buildCategoryInfoMap: vi.fn().mockResolvedValue(new Map()),
      listActiveCategories: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("サマリー返信のリンク確認", () => {
  it.each([
    ["解除後", []],
    ["別のLINEアカウントへの変更後", [{ ...originalLink, id: "link-b", lineUserId: "line-b" }]],
    ["同じLINEアカウントへの再連携後", [{ ...originalLink, id: "link-b" }]],
    ["LINEアカウントが一致しない場合", [{ ...originalLink, lineUserId: "line-b" }]],
    ["別のアプリユーザーのリンクの場合", [{ ...originalLink, userId: "user-b" }]],
    ["有効リンクが複数の場合", [originalLink, { ...originalLink, id: "link-b" }]],
  ] satisfies [string, LineAccountLinkRecord[]][])(
    "%sは家計を読まず未連携案内を返す",
    async (_, links) => {
      const deps = createDeps(links);
      await expect(buildSummaryReply(deps, args)).resolves.toEqual({
        replyKind: "unlinked",
        replyText: LINE_UNLINKED_GUIDANCE_MESSAGE,
      });
      expect(deps.activeGroup.resolve).not.toHaveBeenCalled();
      expect(deps.groups.get).not.toHaveBeenCalled();
      expect(deps.userSettings.resolveWeeklyStartDay).not.toHaveBeenCalled();
      expect(deps.summaryData.getWeekSpendingEntries).not.toHaveBeenCalled();
      expect(deps.summaryData.getWeekIncomeEntries).not.toHaveBeenCalled();
      expect(deps.summaryData.buildCategoryInfoMap).not.toHaveBeenCalled();
      expect(deps.summaryData.listActiveCategories).not.toHaveBeenCalled();
    },
  );

  it("イベントのリンクが有効な場合だけ家計を読む", async () => {
    const deps = createDeps([originalLink]);
    await expect(buildSummaryReply(deps, args)).resolves.toMatchObject({
      replyKind: "week_summary",
    });
    expect(deps.summaryData.getWeekSpendingEntries).toHaveBeenCalledWith("group-a", "2026-08-10");
  });
});

describe("テキスト支出入力の返信分岐", () => {
  const categories = [
    { id: "cat-food", name: "食費" },
    { id: "cat-daily", name: "日用品" },
  ];

  function depsWithCategories(links: LineAccountLinkRecord[]) {
    const deps = createDeps(links);
    deps.summaryData.listActiveCategories = vi.fn().mockResolvedValue(categories);
    return deps;
  }

  it.each(["食費 1,200円", "日用品 300", "コンビニ 500", "Amazon 500"] as const)(
    "「%s」はカテゴリ名＋金額でも下書き作成の返信を返す",
    async (messageText) => {
      const deps = depsWithCategories([originalLink]);
      const result = await buildSummaryReply(deps, { ...args, messageText });
      expect(result.replyKind).toBe("expense_draft");
      expect(result.replyText).toContain("下書きを作成したよ");
    },
  );

  it.each([
    ["食費", "category_lookup"],
    ["使い方", "help"],
    ["レシート", "receipt_guide"],
  ] as const)(
    "下書きを作らない入力「%s」は下書き作成済みとは返さない（%s）",
    async (messageText, replyKind) => {
      const deps = depsWithCategories([originalLink]);
      const result = await buildSummaryReply(deps, { ...args, messageText });
      expect(result.replyKind).toBe(replyKind);
      expect(result.replyText).not.toContain("下書きを作成したよ");
    },
  );
});
