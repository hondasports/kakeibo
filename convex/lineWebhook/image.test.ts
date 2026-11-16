// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { MOCK_LINE_IMAGE_BYTES } from "../../lib/convex/lineWebhook/lineMessagingClient";
import { buildLinkedImageReply, processLinkedImageHandler } from "./image";
import {
  LINE_IMAGE_CONSENT_REQUIRED_MESSAGE,
  LINE_IMAGE_FETCH_FAILED_MESSAGE,
  LINE_IMAGE_INVALID_MESSAGE,
  LINE_IMAGE_TOO_LARGE_MESSAGE,
  formatLineImageAnalysisFailedReply,
  formatLineImageDraftCreatedReply,
  buildLineImageReviewUrl,
} from "../../lib/domain/lineImage/reply";
import {
  LINE_NO_GROUP_MESSAGE,
  LINE_UNRESOLVED_GROUP_MESSAGE,
} from "../../lib/domain/lineSummary/reply";
import {
  LineImageContentTooLargeError,
  MAX_LINE_IMAGE_RAW_BYTES,
} from "../../lib/domain/lineImage/content";

const USER_A = "kakeibo-user-a";
const USER_B = "kakeibo-user-b";
const LINE_USER_A = "line-user-a";
const WEBHOOK_EVENT_ID = "event-image-a";
const MESSAGE_ID = "message-image-a";

function asActionCtx(t: ReturnType<typeof convexTest>): ActionCtx {
  return {
    runQuery: (query, args) => t.query(query, args),
    runMutation: (mutation, args) => t.mutation(mutation, args),
  } as unknown as ActionCtx;
}

function jpegContent() {
  return { bytes: MOCK_LINE_IMAGE_BYTES, contentType: "image/jpeg" };
}

async function seedHousehold(
  t: ReturnType<typeof convexTest>,
  options: {
    userId: string;
    lineUserId: string;
    consent?: boolean;
    withGroup?: boolean;
    extraGroup?: boolean;
    activeGroup?: boolean;
    webhookEventId?: string;
    messageId?: string;
  },
) {
  return t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: `${options.userId}-group`,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const extraGroupId = await ctx.db.insert("groups", {
      name: `${options.userId}-extra`,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: options.userId,
      displayName: options.userId,
      createdAt: 1,
      updatedAt: 1,
      ...(options.withGroup === false || options.activeGroup === false
        ? {}
        : { activeGroupId: groupId }),
      ...(options.consent ? { receiptImageExternalApiConsentAcceptedAt: 1 } : {}),
    });
    if (options.withGroup !== false) {
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: options.userId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    if (options.extraGroup) {
      await ctx.db.insert("groupMembers", {
        groupId: extraGroupId,
        userId: options.userId,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    await ctx.db.insert("lineAccountLinks", {
      userId: options.userId,
      lineUserId: options.lineUserId,
      status: "active",
      linkedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#f97316",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const webhookEventId = options.webhookEventId ?? WEBHOOK_EVENT_ID;
    const messageId = options.messageId ?? MESSAGE_ID;
    await ctx.db.insert("lineWebhookEvents", {
      webhookEventId,
      eventType: "image",
      delivery: "linked",
      userId: options.userId,
      messageId,
      createdAt: 1,
    });
    await ctx.db.insert("lineImageJobs", {
      webhookEventId,
      userId: options.userId,
      messageId,
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, extraGroupId };
  });
}

describe("LINE linked image processing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("同意とグループがある連携ユーザーの画像はneeds_review下書きになり、自動登録しない", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    vi.stubEnv("APP_BASE_URL", "https://suzumemo.test");
    const { groupId } = await seedHousehold(t, {
      userId: USER_A,
      lineUserId: LINE_USER_A,
      consent: true,
    });
    const getContent = vi.fn().mockResolvedValue(jpegContent());

    const reply = await buildLinkedImageReply(
      asActionCtx(t),
      {
        replyToken: "reply-token-private",
        userId: USER_A,
        webhookEventId: WEBHOOK_EVENT_ID,
        messageId: MESSAGE_ID,
      },
      getContent,
    );

    expect(getContent).toHaveBeenCalledWith(MESSAGE_ID);
    expect(reply).toBe(formatLineImageDraftCreatedReply(buildLineImageReviewUrl()));
    expect(reply).not.toMatch(/\d+円/);

    const state = await t.run(async (ctx) => {
      const drafts = await ctx.db.query("aiExpenseDrafts").collect();
      const entries = await ctx.db.query("expenseEntries").collect();
      const receipts = await ctx.db.query("receipts").collect();
      const jobs = await ctx.db.query("lineImageJobs").collect();
      return { drafts, entries, receipts, jobs };
    });
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0]).toMatchObject({
      groupId,
      createdByUserId: USER_A,
      sourceType: "image_upload",
      status: "needs_review",
    });
    expect(state.drafts[0]?.reviewReasons).toContain("user_confirmation_required");
    expect(state.entries).toHaveLength(0);
    expect(state.receipts).toHaveLength(0);
    expect(state.jobs[0]).toMatchObject({ status: "drafted", draftId: state.drafts[0]?._id });
    expect(JSON.stringify(state)).not.toContain("data:image");
    expect(JSON.stringify(state)).not.toContain("reply-token-private");
    expect(JSON.stringify(state)).not.toContain(LINE_USER_A);
  });

  it("再実行時は画像再取得も下書き再作成もしない", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: true });
    const getContent = vi.fn().mockResolvedValue(jpegContent());
    const args = {
      replyToken: "reply-token-private",
      userId: USER_A,
      webhookEventId: WEBHOOK_EVENT_ID,
      messageId: MESSAGE_ID,
    };

    await buildLinkedImageReply(asActionCtx(t), args, getContent);
    getContent.mockClear();
    getContent.mockRejectedValue(new Error("should not fetch"));
    const replay = await buildLinkedImageReply(asActionCtx(t), args, getContent);

    expect(getContent).not.toHaveBeenCalled();
    expect(replay).toBe(formatLineImageDraftCreatedReply(buildLineImageReviewUrl()));
    await expect(
      t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect()),
    ).resolves.toHaveLength(1);
  });

  it("Web同意が無い連携ユーザーはOpenAIも下書きも作らず、取得失敗でも家計金額を返さない", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "real");
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: false });
    const getContent = vi.fn().mockResolvedValue(jpegContent());

    const reply = await buildLinkedImageReply(
      asActionCtx(t),
      {
        replyToken: "reply-token-private",
        userId: USER_A,
        webhookEventId: WEBHOOK_EVENT_ID,
        messageId: MESSAGE_ID,
      },
      getContent,
    );

    expect(reply).toBe(LINE_IMAGE_CONSENT_REQUIRED_MESSAGE);
    expect(getContent).not.toHaveBeenCalled();
    const state = await t.run(async (ctx) => ({
      drafts: await ctx.db.query("aiExpenseDrafts").collect(),
      jobs: await ctx.db.query("lineImageJobs").collect(),
    }));
    expect(state.drafts).toHaveLength(0);
    expect(state.jobs[0]).toMatchObject({ status: "skipped", skipReason: "no_consent" });
  });

  it("グループ未所属では下書きを作らず既存の案内文を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    await seedHousehold(t, {
      userId: USER_A,
      lineUserId: LINE_USER_A,
      consent: true,
      withGroup: false,
    });

    const getContent = vi.fn().mockResolvedValue(jpegContent());

    const reply = await buildLinkedImageReply(
      asActionCtx(t),
      {
        replyToken: "reply-token-private",
        userId: USER_A,
        webhookEventId: WEBHOOK_EVENT_ID,
        messageId: MESSAGE_ID,
      },
      getContent,
    );

    expect(reply).toBe(LINE_NO_GROUP_MESSAGE);
    expect(getContent).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect()),
    ).resolves.toHaveLength(0);
  });

  it("activeグループ未解決では下書きを作らず既存の案内文を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    await seedHousehold(t, {
      userId: USER_A,
      lineUserId: LINE_USER_A,
      consent: true,
      extraGroup: true,
      activeGroup: false,
    });

    const getContent = vi.fn().mockResolvedValue(jpegContent());

    const reply = await buildLinkedImageReply(
      asActionCtx(t),
      {
        replyToken: "reply-token-private",
        userId: USER_A,
        webhookEventId: WEBHOOK_EVENT_ID,
        messageId: MESSAGE_ID,
      },
      getContent,
    );

    expect(reply).toBe(LINE_UNRESOLVED_GROUP_MESSAGE);
    expect(getContent).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect()),
    ).resolves.toHaveLength(0);
  });

  it.each([
    [
      "fetch_failed",
      LINE_IMAGE_FETCH_FAILED_MESSAGE,
      async () => {
        throw new Error("LINE messaging provider is unavailable");
      },
    ],
    [
      "invalid_image",
      LINE_IMAGE_INVALID_MESSAGE,
      async () => ({ bytes: Uint8Array.from([1, 2, 3]), contentType: "video/mp4" }),
    ],
    [
      "too_large",
      LINE_IMAGE_TOO_LARGE_MESSAGE,
      async () => {
        const oversized = new Uint8Array(MAX_LINE_IMAGE_RAW_BYTES + 1);
        oversized.fill(1);
        return { bytes: oversized, contentType: "image/jpeg" };
      },
    ],
    [
      "too_large_stream",
      LINE_IMAGE_TOO_LARGE_MESSAGE,
      async () => {
        throw new LineImageContentTooLargeError();
      },
    ],
  ] as const)("%sでは下書きを作らず失敗返信する", async (_label, expectedReply, getContent) => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: true });

    await expect(
      buildLinkedImageReply(
        asActionCtx(t),
        {
          replyToken: "reply-token-private",
          userId: USER_A,
          webhookEventId: WEBHOOK_EVENT_ID,
          messageId: MESSAGE_ID,
        },
        getContent,
      ),
    ).resolves.toBe(expectedReply);
    await expect(
      t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect()),
    ).resolves.toHaveLength(0);
  });

  it("解析失敗時はfailed下書きを残し、他ユーザーのグループへは作らない", async () => {
    const t = convexTest(schema, convexTestModules);
    // development + real は extractor の設定ガードを解析失敗経路として使う。
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "real");
    const { groupId: userBGroupId } = await seedHousehold(t, {
      userId: USER_B,
      lineUserId: "line-user-b",
      consent: true,
      webhookEventId: "event-image-b",
      messageId: "message-image-b",
    });
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: true });

    const reply = await buildLinkedImageReply(
      asActionCtx(t),
      {
        replyToken: "reply-token-private",
        userId: USER_A,
        webhookEventId: WEBHOOK_EVENT_ID,
        messageId: MESSAGE_ID,
      },
      async () => jpegContent(),
    );

    expect(reply).toBe(formatLineImageAnalysisFailedReply(buildLineImageReviewUrl()));
    const drafts = await t.run(async (ctx) => ctx.db.query("aiExpenseDrafts").collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      createdByUserId: USER_A,
      status: "failed",
    });
    expect(drafts[0]?.groupId).not.toBe(userBGroupId);
  });

  it("claimから予約されたimage actionはmock modeで下書きを作り外部APIを呼ばない", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_INTEGRATION_MODE", "mock");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: true });
    await t.run(async (ctx) => {
      const jobs = await ctx.db.query("lineImageJobs").collect();
      const events = await ctx.db.query("lineWebhookEvents").collect();
      for (const job of jobs) await ctx.db.delete(job._id);
      for (const event of events) await ctx.db.delete(event._id);
    });

    const claimed = await t.mutation(internal.lineWebhook.internal.claimEvents, {
      events: [
        {
          webhookEventId: "event-image-scheduled",
          eventType: "image",
          lineUserId: LINE_USER_A,
          messageId: "message-image-scheduled",
          replyToken: "reply-token-private",
        },
      ],
    });
    expect(claimed.scheduledImageCount).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const state = await t.run(async (ctx) => ({
      drafts: await ctx.db.query("aiExpenseDrafts").collect(),
      jobs: await ctx.db.query("lineImageJobs").collect(),
      entries: await ctx.db.query("expenseEntries").collect(),
    }));
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0]).toMatchObject({
      createdByUserId: USER_A,
      status: "needs_review",
    });
    expect(state.jobs[0]).toMatchObject({ status: "drafted" });
    expect(state.entries).toHaveLength(0);
  });

  it("処理例外はbounded retryを予約し、最終失敗時だけjobをfailedにする", async () => {
    const t = convexTest(schema, convexTestModules);
    vi.stubEnv("APP_ENV", "development");
    await seedHousehold(t, { userId: USER_A, lineUserId: LINE_USER_A, consent: true });

    const runAfter = vi.fn().mockResolvedValue(undefined);
    const runMutation = vi.fn();
    const failingCtx = {
      runQuery: vi.fn().mockRejectedValue(new Error("query unavailable")),
      runMutation,
      scheduler: { runAfter },
    } as unknown as ActionCtx;

    await expect(
      processLinkedImageHandler(
        failingCtx,
        {
          replyToken: "reply-token-private",
          userId: USER_A,
          webhookEventId: WEBHOOK_EVENT_ID,
          messageId: MESSAGE_ID,
        },
        vi.fn(),
      ),
    ).resolves.toBeNull();
    expect(runAfter).toHaveBeenCalledWith(
      1_000,
      internal.lineWebhook.image.processLinkedImage,
      expect.objectContaining({
        webhookEventId: WEBHOOK_EVENT_ID,
        attempt: 1,
      }),
    );
    expect(runMutation).not.toHaveBeenCalled();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        processLinkedImageHandler(
          {
            runQuery: vi.fn().mockRejectedValue(new Error("query unavailable")),
            runMutation: (mutation, args) => t.mutation(mutation, args),
            scheduler: { runAfter },
          } as unknown as ActionCtx,
          {
            replyToken: "reply-token-private",
            userId: USER_A,
            webhookEventId: WEBHOOK_EVENT_ID,
            messageId: MESSAGE_ID,
            attempt: 2,
          },
          vi.fn(),
        ),
      ).resolves.toBeNull();
      expect(runAfter).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain(WEBHOOK_EVENT_ID);
      expect(logged).not.toContain(USER_A);
      expect(logged).not.toContain(MESSAGE_ID);
    } finally {
      errorSpy.mockRestore();
    }

    await expect(t.run(async (ctx) => ctx.db.query("lineImageJobs").collect())).resolves.toEqual([
      expect.objectContaining({ webhookEventId: WEBHOOK_EVENT_ID, status: "failed" }),
    ]);
  });
});
