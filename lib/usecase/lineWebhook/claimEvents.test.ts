import { describe, expect, it, vi } from "vitest";
import type { LineAccountLinkRecord } from "../../domain/lineLink/records";
import type { LineWebhookEventInput } from "../../domain/lineWebhook/payload";
import { claimEvents, type ClaimEventsDeps } from "./claimEvents";

const link: LineAccountLinkRecord = {
  id: "link-a",
  userId: "user-a",
  lineUserId: "line-a",
  status: "active",
  linkedAt: 100,
  createdAt: 100,
  updatedAt: 100,
};

const categories = [
  { id: "cat-food", name: "食費" },
  { id: "cat-daily", name: "日用品" },
];

const NOW = Date.parse("2026-08-12T12:00:00+09:00");

function textEvent(overrides: Partial<LineWebhookEventInput> = {}): LineWebhookEventInput {
  return {
    webhookEventId: "ev-1",
    eventType: "text",
    lineUserId: "line-a",
    replyToken: "reply-token",
    messageText: "コンビニ 500",
    eventTimestamp: NOW,
    ...overrides,
  };
}

function createDeps(
  overrides: {
    links?: LineAccountLinkRecord[];
    findByWebhookEventId?: (id: string) => Promise<unknown>;
    groupResolution?:
      | { status: "resolved"; groupId: string }
      | { status: "no_group" }
      | { status: "unresolved" };
    group?: { id: string; status?: string } | null;
    expenseDraftCreatedAts?: number[];
  } = {},
) {
  const {
    links = [link],
    findByWebhookEventId = async () => null,
    groupResolution = { status: "resolved", groupId: "group-a" },
    group = { id: "group-a", status: "active" },
    expenseDraftCreatedAts = [],
  } = overrides;
  const deps: ClaimEventsDeps = {
    webhookEvents: {
      findByWebhookEventId: vi.fn(findByWebhookEventId as never),
      insert: vi.fn(async () => undefined),
    },
    imageJobs: {
      findByWebhookEventId: vi.fn(async () => null),
      insert: vi.fn(async () => undefined),
    },
    accountLinks: {
      listActiveByLineUserId: vi.fn(async () => links),
      listActiveByUserId: vi.fn(async () => links),
      insert: vi.fn(async () => undefined),
    },
    scheduler: {
      scheduleSummaryReply: vi.fn(async () => undefined),
      scheduleUnlinkedGuide: vi.fn(async () => undefined),
      scheduleProcessLinkedImage: vi.fn(async () => undefined),
      scheduleCleanup: vi.fn(async () => undefined),
    },
    activeGroup: { resolve: vi.fn(async () => groupResolution) },
    groups: { get: vi.fn(async () => group) },
    summaryData: {
      getWeekSpendingEntries: vi.fn(async () => []),
      getWeekIncomeEntries: vi.fn(async () => []),
      buildCategoryInfoMap: vi.fn(async () => new Map()),
      listActiveCategories: vi.fn(async () => categories),
    },
    expenseDrafts: {
      createFromLineText: vi.fn(async () => undefined),
      lineTextDraftCreatedAtsSince: vi.fn(async () => expenseDraftCreatedAts),
    },
  };
  return deps;
}

describe("LINEテキストの支出下書き作成", () => {
  it("連携済みで所属が解決できる入力は下書きを1件作る", async () => {
    const deps = createDeps();
    const result = await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledTimes(1);
    expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledWith({
      groupId: "group-a",
      createdByUserId: "user-a",
      title: "コンビニ",
      amountYen: 500,
      categoryId: undefined,
      date: "2026-08-12",
      now: expect.any(Number),
    });
    expect(result.claimedCount).toBe(1);
    expect(result.scheduledSummaryCount).toBe(1);
  });

  it.each([
    ["食費 1,200円", "食費", 1200, "cat-food"],
    ["日用品 300", "日用品", 300, "cat-daily"],
    ["コンビニ 500", "コンビニ", 500, undefined],
    ["Amazon 500", "Amazon", 500, undefined],
  ] as const)(
    "「%s」はカテゴリ名と金額でも下書きを作り、カテゴリは内容だけで解決する",
    async (messageText, title, amountYen, categoryId) => {
      const deps = createDeps();
      await claimEvents(deps, [textEvent({ messageText })]);
      expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledTimes(1);
      expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledWith(
        expect.objectContaining({ title, amountYen, categoryId }),
      );
    },
  );

  it("金額を含まない入力は下書きを作らない", async () => {
    const deps = createDeps();
    await claimEvents(deps, [textEvent({ messageText: "食費" })]);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
    // サマリー返信の予約は従来どおり行われる
    expect(deps.scheduler.scheduleSummaryReply).toHaveBeenCalledTimes(1);
  });

  it("グループが解決できない場合は下書きを作らない", async () => {
    const deps = createDeps({ groupResolution: { status: "unresolved" } });
    await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
  });

  it("グループが削除済みの場合は下書きを作らない", async () => {
    const deps = createDeps({ group: { id: "group-a", status: "deleting" } });
    await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
  });

  it("同じ webhookEventId が2回届いても下書きは1件だけ", async () => {
    // 既存イベントとして既に登録済みのIDを返す（LINE再送の経路）
    const deps = createDeps({
      findByWebhookEventId: async (id) => (id === "ev-1" ? { webhookEventId: "ev-1" } : null),
    });
    const result = await claimEvents(deps, [textEvent()]);
    expect(result.duplicateCount).toBe(1);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
  });

  it("当日（JST）30件目まで作り、31件目は作らない", async () => {
    const deps = createDeps({
      expenseDraftCreatedAts: Array.from({ length: 30 }, (_, i) => NOW - 1000 * (i + 1)),
    });
    await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
  });

  it("当日（JST）29件までなら30件目を作る", async () => {
    const deps = createDeps({
      expenseDraftCreatedAts: Array.from({ length: 29 }, (_, i) => NOW - 1000 * (i + 1)),
    });
    await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledTimes(1);
  });

  it("同じバッチ内の重複 webhookEventId も1件だけ", async () => {
    const deps = createDeps();
    const result = await claimEvents(deps, [textEvent(), textEvent()]);
    expect(result.duplicateCount).toBe(1);
    expect(deps.expenseDrafts.createFromLineText).toHaveBeenCalledTimes(1);
  });

  it("未連携ユーザーは下書きを作らず案内返信を予約する", async () => {
    const deps = createDeps({ links: [] });
    const result = await claimEvents(deps, [textEvent()]);
    expect(deps.expenseDrafts.createFromLineText).not.toHaveBeenCalled();
    expect(deps.scheduler.scheduleSummaryReply).not.toHaveBeenCalled();
    expect(deps.scheduler.scheduleUnlinkedGuide).toHaveBeenCalledWith({
      replyToken: "reply-token",
    });
    expect(result.scheduledGuideCount).toBe(1);
  });
});
