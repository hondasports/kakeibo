import { describe, expect, it, vi } from "vitest";
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
  it("リンクを特定できない既存ジョブは集計・返信・再予約をしない", async () => {
    const deps = createDeps();
    const { linkId: _linkId, lineUserId: _lineUserId, ...legacyArgs } = args;
    await expect(sendSummaryReply(deps, legacyArgs)).resolves.toBeNull();
    expect(deps.summary.buildReply).not.toHaveBeenCalled();
    expect(deps.replySender.sendTextReply).not.toHaveBeenCalled();
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).not.toHaveBeenCalled();
  });

  it("無効になったリンクには返信も再予約もしない", async () => {
    const deps = createDeps();
    deps.summary.buildReply.mockResolvedValue(null);
    await expect(sendSummaryReply(deps, args)).resolves.toBeNull();
    expect(deps.replySender.sendTextReply).not.toHaveBeenCalled();
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
    deps.summary.buildReply.mockResolvedValue(null);
    await sendSummaryReply(deps, { ...args, attempt: 1 });
    expect(deps.summary.buildReply).toHaveBeenCalledTimes(2);
    expect(deps.replySender.sendTextReply).toHaveBeenCalledTimes(1);
    expect(deps.actionScheduler.scheduleSummaryReplyRetry).toHaveBeenCalledTimes(1);
  });
});
