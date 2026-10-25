import type { ActionCtx } from "../_generated/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINE_UNLINKED_GUIDANCE_MESSAGE,
  MOCK_LINE_IMAGE_BYTES,
  getLineMessageContent,
  sendLineTextReply,
} from "./client";
import {
  LineImageContentTooLargeError,
  MAX_LINE_IMAGE_RAW_BYTES,
} from "../../lib/domain/lineImage/content";
import { sendSummaryReplyHandler, sendUnlinkedGuideHandler } from "./actions";
import { buildLineQuickReplyActions } from "../../lib/domain/lineSummary/quickReply";

function setEnvironment(values: Record<string, string | undefined>) {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe("LINE messaging client", () => {
  beforeEach(() => {
    process.env.APP_ENV = "development";
  });

  it("返信本文は5000文字まで許可し、空文字と5001文字を送信前に拒否する", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const fetchImpl = vi.fn();
    try {
      await expect(
        sendLineTextReply("reply-token", "あ".repeat(5000), fetchImpl),
      ).resolves.toBeUndefined();
      for (const text of ["", "あ".repeat(5001)]) {
        await expect(sendLineTextReply("reply-token", text, fetchImpl)).rejects.toThrow(
          "LINE reply text is invalid",
        );
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("画像取得IDは256文字まで許可し、空文字・空白・257文字を取得前に拒否する", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const fetchImpl = vi.fn();
    try {
      await expect(getLineMessageContent("a".repeat(256), fetchImpl)).resolves.toMatchObject({
        contentType: "image/jpeg",
      });
      for (const messageId of ["", " ", "a".repeat(257)]) {
        await expect(getLineMessageContent(messageId, fetchImpl)).rejects.toThrow(
          "LINE message id is invalid",
        );
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it.each([1, 2])("案内とサマリーの再試行はattempt=%iで同じ上限を守る", async (attempt) => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token",
    });
    const runAfter = vi.fn().mockResolvedValue(undefined);
    const runQuery = vi.fn().mockResolvedValue({ replyText: "今週の支出: 1,000円" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider unavailable")));
    try {
      const ctx = { runQuery, scheduler: { runAfter } } as unknown as ActionCtx;
      await sendUnlinkedGuideHandler(ctx, { replyToken: "reply-token", attempt });
      await sendSummaryReplyHandler(ctx, {
        replyToken: "reply-token",
        userId: "user-a",
        linkId: "link-a",
        lineUserId: "line-a",
        messageText: "今週の支出",
        nowMs: 1,
        attempt,
      });
      if (attempt === 1) {
        expect(runAfter).toHaveBeenCalledTimes(2);
        expect(runAfter).toHaveBeenNthCalledWith(1, 1_000, expect.anything(), {
          replyToken: "reply-token",
          attempt: 2,
        });
        expect(runAfter).toHaveBeenNthCalledWith(2, 1_000, expect.anything(), {
          replyToken: "reply-token",
          userId: "user-a",
          linkId: "link-a",
          lineUserId: "line-a",
          messageText: "今週の支出",
          nowMs: 1,
          attempt: 2,
        });
      } else {
        expect(runAfter).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
      restore();
    }
  });

  it("mock modeでは外部APIへ送信しない", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const fetchImpl = vi.fn();
    try {
      await expect(
        sendLineTextReply("reply-token", LINE_UNLINKED_GUIDANCE_MESSAGE, fetchImpl),
      ).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("internal guide actionもmock client経由で外部APIを呼ばない", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    try {
      await expect(
        sendUnlinkedGuideHandler({} as ActionCtx, { replyToken: "reply-token" }),
      ).resolves.toBeNull();
    } finally {
      restore();
    }
  });

  it("案内送信のprovider errorはbounded retryを予約する", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token",
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const runAfter = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await expect(
        sendUnlinkedGuideHandler({ scheduler: { runAfter } } as unknown as ActionCtx, {
          replyToken: "reply-token",
        }),
      ).resolves.toBeNull();
      expect(runAfter).toHaveBeenCalledWith(1_000, expect.anything(), {
        replyToken: "reply-token",
        attempt: 1,
      });
    } finally {
      vi.unstubAllGlobals();
      restore();
    }
  });

  it("real modeではserver-side access tokenで固定案内を送る", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    try {
      await sendLineTextReply("reply-token-private", LINE_UNLINKED_GUIDANCE_MESSAGE, fetchImpl);
      const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.line.me/v2/bot/message/reply",
        expect.objectContaining({ method: "POST" }),
      );
      expect(request.headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer access-token-private" }),
      );
      expect(JSON.parse(String(request.body))).toEqual({
        replyToken: "reply-token-private",
        messages: [{ type: "text", text: LINE_UNLINKED_GUIDANCE_MESSAGE }],
      });
    } finally {
      restore();
    }
  });

  it("real modeでは指定したサマリー本文を返信する", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    try {
      await sendLineTextReply("reply-token-private", "今週の支出: 1,000円", fetchImpl);
      const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(request.body))).toEqual({
        replyToken: "reply-token-private",
        messages: [{ type: "text", text: "今週の支出: 1,000円" }],
      });
    } finally {
      restore();
    }
  });

  it("real modeのサマリー返信は許可したクイックリプライだけを付ける", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
      APP_BASE_URL: "https://suzumemo.test/",
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const runQuery = vi.fn().mockResolvedValue({
      replyText: "今週の支出: 1,000円",
      replyKind: "week_expense",
    });
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await sendSummaryReplyHandler({ runQuery } as unknown as ActionCtx, {
        replyToken: "reply-token-private",
        userId: "user-a",
        linkId: "link-a",
        lineUserId: "line-a",
        messageText: "今週の支出",
        nowMs: 1,
      });
      const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const webUrl = "https://suzumemo.test/weeks/current/input";
      expect(JSON.parse(String(request.body))).toEqual({
        replyToken: "reply-token-private",
        messages: [
          {
            type: "text",
            text: "今週の支出: 1,000円",
            quickReply: {
              items: buildLineQuickReplyActions("week_expense", webUrl).map((action) =>
                action.type === "message"
                  ? {
                      type: "action",
                      action: { type: "message", label: action.label, text: action.text },
                    }
                  : {
                      type: "action",
                      action: { type: "uri", label: action.label, uri: action.uri },
                    },
              ),
            },
          },
        ],
      });
    } finally {
      vi.unstubAllGlobals();
      restore();
    }
  });

  it("real modeのsecret不足とprovider errorを公開処理へ通さない", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: undefined,
    });
    try {
      await expect(
        sendLineTextReply("reply-token", LINE_UNLINKED_GUIDANCE_MESSAGE, vi.fn()),
      ).rejects.toThrow("LINE messaging integration is unavailable");
      const fetchImpl = vi.fn().mockResolvedValue(new Response("failure", { status: 500 }));
      const withToken = setEnvironment({ LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "token" });
      try {
        await expect(
          sendLineTextReply("reply-token", LINE_UNLINKED_GUIDANCE_MESSAGE, fetchImpl),
        ).rejects.toThrow("LINE messaging provider rejected the reply");
      } finally {
        withToken();
      }
    } finally {
      restore();
    }
  });

  it("summary actionはqueryの返信文を使い、失敗時はbounded retryする", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const runQuery = vi.fn().mockResolvedValue({ replyText: "今週の支出: 1,000円" });
    try {
      await expect(
        sendSummaryReplyHandler({ runQuery } as unknown as ActionCtx, {
          replyToken: "reply-token",
          userId: "user-a",
          linkId: "link-a",
          lineUserId: "line-a",
          messageText: "今週の支出",
          nowMs: 1,
        }),
      ).resolves.toBeNull();
      expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
        userId: "user-a",
        linkId: "link-a",
        lineUserId: "line-a",
        messageText: "今週の支出",
        nowMs: 1,
      });
    } finally {
      restore();
    }

    const realRestore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token",
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const runAfter = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await expect(
        sendSummaryReplyHandler({ runQuery, scheduler: { runAfter } } as unknown as ActionCtx, {
          replyToken: "reply-token",
          userId: "user-a",
          linkId: "link-a",
          lineUserId: "line-a",
          messageText: "今週の支出",
          nowMs: 1,
        }),
      ).resolves.toBeNull();
      expect(runAfter).toHaveBeenCalledWith(1_000, expect.anything(), {
        replyToken: "reply-token",
        userId: "user-a",
        linkId: "link-a",
        lineUserId: "line-a",
        messageText: "今週の支出",
        nowMs: 1,
        attempt: 1,
      });
    } finally {
      vi.unstubAllGlobals();
      realRestore();
    }
  });

  it("summary queryでリンクを確認できない場合は返信しない", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token",
    });
    const runQuery = vi.fn().mockRejectedValue(new Error("query failed"));
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const runAfter = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await expect(
        sendSummaryReplyHandler({ runQuery, scheduler: { runAfter } } as unknown as ActionCtx, {
          replyToken: "reply-token",
          userId: "user-a",
          linkId: "link-a",
          lineUserId: "line-a",
          messageText: "今週",
          nowMs: 1,
        }),
      ).resolves.toBeNull();
      expect(runAfter).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      restore();
    }
  });

  it("mock modeの画像取得は実LINE content APIを呼ばず固定バイナリを返す", async () => {
    const restore = setEnvironment({ LINE_INTEGRATION_MODE: "mock" });
    const fetchImpl = vi.fn();
    try {
      await expect(getLineMessageContent("message-id-private", fetchImpl)).resolves.toEqual({
        bytes: MOCK_LINE_IMAGE_BYTES,
        contentType: "image/jpeg",
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("real modeの画像取得はserver-side access tokenでcontent APIだけを呼ぶ", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    try {
      const content = await getLineMessageContent("message-id-private", fetchImpl);
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api-data.line.me/v2/bot/message/message-id-private/content",
        expect.objectContaining({ method: "GET" }),
      );
      const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(request.headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer access-token-private" }),
      );
      expect(content.contentType).toBe("image/jpeg");
      expect(Array.from(content.bytes)).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    } finally {
      restore();
    }
  });

  it("real modeの画像取得はsecret不足とprovider errorを公開処理へ通さない", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: undefined,
    });
    try {
      await expect(getLineMessageContent("message-id", vi.fn())).rejects.toThrow(
        "LINE messaging integration is unavailable",
      );
      const fetchImpl = vi.fn().mockResolvedValue(new Response("failure", { status: 500 }));
      const withToken = setEnvironment({ LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "token" });
      try {
        await expect(getLineMessageContent("message-id", fetchImpl)).rejects.toThrow(
          "LINE messaging provider rejected the content request",
        );
      } finally {
        withToken();
      }
    } finally {
      restore();
    }
  });

  it("real modeの画像取得はContent-Length超過なら本文を読まず失敗する", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(1024).fill(1));
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(MAX_LINE_IMAGE_RAW_BYTES + 1),
        },
      }),
    );
    try {
      await expect(getLineMessageContent("message-id-private", fetchImpl)).rejects.toBeInstanceOf(
        LineImageContentTooLargeError,
      );
      expect(pullCount).toBeLessThan(3);
    } finally {
      restore();
    }
  });

  it("real modeの画像取得はストリーム読取中に生バイト上限を超えたら中断する", async () => {
    const restore = setEnvironment({
      LINE_INTEGRATION_MODE: "real",
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "access-token-private",
    });
    let pullCount = 0;
    const chunk = new Uint8Array(100_000).fill(1);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    try {
      await expect(getLineMessageContent("message-id-private", fetchImpl)).rejects.toBeInstanceOf(
        LineImageContentTooLargeError,
      );
      expect(pullCount).toBeGreaterThan(0);
      expect(pullCount).toBeLessThan(20);
    } finally {
      restore();
    }
  });
});
