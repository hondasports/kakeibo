import { describe, expect, it, vi } from "vitest";
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";
import { LINE_SUMMARY_UNAVAILABLE_MESSAGE } from "../../domain/lineSummary/reply";
import { sendSummaryReply } from "./sendSummaryReply";

const args = {
  replyToken: "reply-token",
  userId: "user-a",
  linkId: "link-a",
  lineUserId: "line-a",
  messageText: "今週",
  nowMs: 1,
};

function createDeps() {
  return {
    summary: {
      buildReply: vi
        .fn()
        .mockResolvedValue({ replyText: "今週の支出: 1,000円", replyKind: "week_expense" }),
    },
    replySender: { sendTextReply: vi.fn().mockResolvedValue(undefined) },
    actionScheduler: {
      scheduleUnlinkedGuideRetry: vi.fn(),
      scheduleSummaryReplyRetry: vi.fn(),
      scheduleProcessLinkedImageRetry: vi.fn(),
    },
  };
}

describe("サマリー返信の送信条件", () => {
  it("リンクを特定できない既存ジョブは集計せず取得失敗の固定文を返す", async () => {
    const deps = createDeps();
    const { linkId: _linkId, lineUserId: _lineUserId, ...legacyArgs } = args;
    await expect(sendSummaryReply(deps, legacyArgs)).resolves.toBeNull();
    expect(deps.summary.buildReply).not.toHaveBeenCalled();
    expect(deps.replySender.sendTextReply).toHaveBeenCalledWith(
      "reply-token",
      LINE_SUMMARY_UNAVAILABLE_MESSAGE,
      [],
    );
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).not.toHaveBeenCalled();
  });

  it("無効になったリンクには金額を含まない未連携案内を返す", async () => {
    const deps = createDeps();
    deps.summary.buildReply.mockResolvedValue({
      replyKind: "unlinked",
      replyText: LINE_UNLINKED_GUIDANCE_MESSAGE,
    });
    await expect(sendSummaryReply(deps, args)).resolves.toBeNull();
    expect(deps.replySender.sendTextReply).toHaveBeenCalledWith(
      "reply-token",
      LINE_UNLINKED_GUIDANCE_MESSAGE,
      [],
    );
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).not.toHaveBeenCalled();
  });

  it("再試行にも元のリンクを引き継ぎ、実行時に再確認する", async () => {
    const deps = createDeps();
    deps.replySender.sendTextReply.mockRejectedValueOnce(new Error("provider unavailable"));
    await sendSummaryReply(deps, args);
    expect(deps.summary.buildReply).toHaveBeenCalledWith({
      userId: args.userId,
      linkId: args.linkId,
      lineUserId: args.lineUserId,
      messageText: args.messageText,
      nowMs: args.nowMs,
    });
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).toHaveBeenCalledWith(1_000, {
      ...args,
      attempt: 1,
    });
    deps.summary.buildReply.mockResolvedValue({
      replyKind: "unlinked",
      replyText: LINE_UNLINKED_GUIDANCE_MESSAGE,
    });
    await sendSummaryReply(deps, { ...args, attempt: 1 });
    expect(deps.summary.buildReply).toHaveBeenCalledTimes(2);
    expect(deps.replySender.sendTextReply).toHaveBeenCalledTimes(2);
    expect(deps.replySender.sendTextReply).toHaveBeenLastCalledWith(
      "reply-token",
      LINE_UNLINKED_GUIDANCE_MESSAGE,
      [],
    );
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).toHaveBeenCalledTimes(1);
  });
  it("集計queryが失敗した場合は取得失敗の固定文を返す", async () => {
    const deps = createDeps();
    deps.summary.buildReply.mockRejectedValue(new Error("query failed"));
    await sendSummaryReply(deps, args);
    expect(deps.replySender.sendTextReply).toHaveBeenCalledWith(
      "reply-token",
      LINE_SUMMARY_UNAVAILABLE_MESSAGE,
      [],
    );
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])("旧形式の再試行も家計を読まずattempt=%iの上限を守る", async (attempt) => {
    const deps = createDeps();
    const { linkId: _linkId, lineUserId: _lineUserId, ...legacyArgs } = args;
    deps.replySender.sendTextReply.mockRejectedValue(new Error("provider unavailable"));
    await sendSummaryReply(deps, { ...legacyArgs, attempt });
    expect(deps.summary.buildReply).not.toHaveBeenCalled();
    expect(deps.replySender.sendTextReply).toHaveBeenCalledWith(
      "reply-token",
      LINE_SUMMARY_UNAVAILABLE_MESSAGE,
      [],
    );
    if (attempt < 2) {
      expect(deps.actionScheduler.scheduleSummaryReplyRetry).toHaveBeenCalledWith(1_000, {
        ...legacyArgs,
        attempt: attempt + 1,
      });
    } else {
      expect(deps.actionScheduler.scheduleSummaryReplyRetry).not.toHaveBeenCalled();
    }
  });
});
