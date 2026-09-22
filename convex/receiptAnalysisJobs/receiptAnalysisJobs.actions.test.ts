import type { Doc, Id } from "../_generated/dataModel";
import { analyzeImageJobHandler, checkAiReviewRequiredHandler } from "./actions";
import {
  GROUP_ID,
  VALID_IMAGE_DATA_URL,
  createActionCtx,
  createIdentity,
  withEnv,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("analyzeImageJobHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証ユーザーは実行できない", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const ctx = createActionCtx(null, {
        runQueryResults: {
          "api.users.queries.getReceiptImageConsent": { hasAcceptedExternalApiConsent: true },
        },
      });
      await expect(
        analyzeImageJobHandler(ctx, {
          jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
          imageDataUrl: VALID_IMAGE_DATA_URL,
        }),
      ).rejects.toThrow(ConvexError);
    });
  });

  it("mock extractor で成功し draft と job を更新する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const jobDoc = {
        _id: "job-1",
        groupId: GROUP_ID,
        batchId: "batch-1",
        status: "queued",
      } as Doc<"receiptAnalysisImageJobs">;

      const draftDoc = {
        _id: "draft-1",
        status: "ready",
      } as Doc<"aiExpenseDrafts">;

      const ctx = createActionCtx(createIdentity(), {
        runQueryResults: {},
        runMutationResults: {},
      });

      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce(jobDoc)
        .mockResolvedValueOnce([
          { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
          { _id: "cat-daily", name: "日用品", color: "#A6B28B", isActive: true, sortOrder: 2 },
        ]);

      ctx.runMutation = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(draftDoc)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await analyzeImageJobHandler(ctx, {
        jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      });

      expect(ctx.runMutation).toHaveBeenCalledTimes(5);
      expect((ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          categoryId: "cat-food",
          imageFileName: undefined,
          items: [
            expect.objectContaining({
              itemName: "サンプル食品",
              amountYen: 734,
              categoryId: "cat-food",
            }),
            expect.objectContaining({
              itemName: "サンプル日用品",
              amountYen: 500,
              categoryId: "cat-daily",
            }),
          ],
        }),
      );
    });
  });

  it("通常draft保存に失敗した後の失敗draft保存もtelemetryへ記録する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const jobDoc = {
        _id: "job-save-failure",
        groupId: GROUP_ID,
        batchId: "batch-1",
        status: "queued",
        fileName: "long-receipt.jpg",
      } as Doc<"receiptAnalysisImageJobs">;
      const failedDraft = {
        _id: "draft-failed",
        status: "failed",
        warnings: ["database unavailable"],
      } as Doc<"aiExpenseDrafts">;
      const ctx = createActionCtx(createIdentity());
      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce(jobDoc)
        .mockResolvedValueOnce([]);
      ctx.runMutation = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("database unavailable"))
        .mockResolvedValueOnce(failedDraft)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await analyzeImageJobHandler(ctx, {
        jobId: "job-save-failure" as Id<"receiptAnalysisImageJobs">,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      });

      expect(info).toHaveBeenCalledWith(
        "receipt_extraction_stage",
        expect.objectContaining({
          telemetryId: "job-save-failure",
          stage: "save",
          outcome: "failure",
          failureKind: "draft_save",
          saveKind: "result_draft",
        }),
      );
      expect(info).toHaveBeenCalledWith(
        "receipt_extraction_stage",
        expect.objectContaining({
          telemetryId: "job-save-failure",
          stage: "save",
          outcome: "success",
          saveKind: "failure_draft",
        }),
      );
    });
  });

  it("再解析成功時はuser overrideを新draftへ継承してから旧draftを削除する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const receiptUserOverride = {
        source: "user" as const,
        updatedAt: 10,
        fields: ["amountYen"],
        values: {
          status: "needs_review" as const,
          documentType: "receipt" as const,
          shopName: "ユーザー店舗",
          date: "2026-07-03",
          amountYen: 7803,
          categoryId: "cat-food",
          confidence: { amountYen: 1 },
          warnings: [],
          reviewReasons: ["amount_mismatch" as const],
          items: [],
        },
      };
      const jobDoc = {
        _id: "job-retry",
        groupId: GROUP_ID,
        batchId: "batch-1",
        status: "failed",
        draftId: "draft-old",
      } as Doc<"receiptAnalysisImageJobs">;
      const oldDraft = {
        _id: "draft-old",
        groupId: GROUP_ID,
        updatedAt: 10,
        receiptUserOverride,
      } as Doc<"aiExpenseDrafts">;
      const newDraft = { _id: "draft-new", status: "needs_review" } as Doc<"aiExpenseDrafts">;
      const ctx = createActionCtx(createIdentity());
      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce(jobDoc)
        .mockResolvedValueOnce({ draft: oldDraft, items: [] })
        .mockResolvedValueOnce([
          { _id: "cat-food", name: "食費", color: "#fff", isActive: true, sortOrder: 1 },
        ]);
      ctx.runMutation = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(newDraft)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await analyzeImageJobHandler(ctx, {
        jobId: "job-retry" as Id<"receiptAnalysisImageJobs">,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      });

      expect((ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({ preservedUserOverride: receiptUserOverride }),
      );
      expect((ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls[2]?.[1]).toMatchObject({
        expectedDraftId: "draft-old",
        expectedDraftUpdatedAt: 10,
        newDraftId: "draft-new",
        status: "needs_review",
      });
      expect(
        (ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[1]?.draftId === "draft-old" && Object.keys(call[1]).length === 1,
        ),
      ).toBe(false);
    });
  });

  it("旧契約でもuser_confirmed合計は再解析時に遅延変換して維持する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const jobDoc = {
        _id: "job-retry",
        groupId: GROUP_ID,
        batchId: "batch-1",
        status: "failed",
        draftId: "draft-old",
      } as Doc<"receiptAnalysisImageJobs">;
      const oldDraft = {
        _id: "draft-old",
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        amountYen: 7803,
        receiptTotalResolution: {
          status: "resolved",
          protectedAmountYen: 7803,
          candidates: [
            { amountYen: 7803, source: "user_confirmed", evidence: "legacy confirmation" },
          ],
          reasons: [],
        },
        confidence: { amountYen: 1 },
        reviewReasons: [],
        updatedAt: 10,
      } as Doc<"aiExpenseDrafts">;
      const newDraft = { _id: "draft-new", status: "ready" } as Doc<"aiExpenseDrafts">;
      const ctx = createActionCtx(createIdentity());
      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce(jobDoc)
        .mockResolvedValueOnce({ draft: oldDraft, items: [] })
        .mockResolvedValueOnce([]);
      ctx.runMutation = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(newDraft)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await analyzeImageJobHandler(ctx, {
        jobId: "job-retry" as Id<"receiptAnalysisImageJobs">,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      });

      expect((ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          preservedUserOverride: expect.objectContaining({
            source: "user",
            fields: ["amountYen", "receiptTotalResolution"],
            values: expect.objectContaining({ amountYen: 7803 }),
          }),
        }),
      );
    });
  });

  it("再解析失敗時は旧draftを残して失敗draftだけを削除する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const jobDoc = {
        _id: "job-retry",
        groupId: GROUP_ID,
        batchId: "batch-1",
        status: "failed",
        draftId: "draft-old",
      } as Doc<"receiptAnalysisImageJobs">;
      const oldDraft = {
        _id: "draft-old",
        groupId: GROUP_ID,
        receiptUserOverride: { source: "user", updatedAt: 1, fields: [], values: {} },
      } as unknown as Doc<"aiExpenseDrafts">;
      const failedDraft = {
        _id: "draft-failed-new",
        status: "failed",
        warnings: ["解析失敗"],
      } as Doc<"aiExpenseDrafts">;
      const ctx = createActionCtx(createIdentity());
      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce(jobDoc)
        .mockResolvedValueOnce({ draft: oldDraft, items: [] })
        .mockResolvedValueOnce([]);
      ctx.runMutation = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(failedDraft)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await analyzeImageJobHandler(ctx, {
        jobId: "job-retry" as Id<"receiptAnalysisImageJobs">,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      });

      expect((ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls[2]?.[1]).toMatchObject({
        expectedDraftId: "draft-old",
        newDraftId: "draft-failed-new",
        status: "failed",
        error: "解析失敗",
      });
      expect(
        (ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[1]?.draftId === "draft-old" && Object.keys(call[1]).length === 1,
        ),
      ).toBe(false);
    });
  });

  it("他グループの job は running に更新せず拒否する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const ctx = createActionCtx(createIdentity());
      ctx.runQuery = vi
        .fn()
        .mockResolvedValueOnce({ hasAcceptedExternalApiConsent: true })
        .mockResolvedValueOnce({ _id: GROUP_ID })
        .mockResolvedValueOnce({
          _id: "job-other",
          groupId: "group-other",
          batchId: "batch-1",
          status: "queued",
        });
      ctx.runMutation = vi.fn();

      await expect(
        analyzeImageJobHandler(ctx, {
          jobId: "job-other" as Id<"receiptAnalysisImageJobs">,
          imageDataUrl: VALID_IMAGE_DATA_URL,
        }),
      ).rejects.toThrow("Job not found");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });
});

describe("checkAiReviewRequiredHandler", () => {
  it("needs_review 待ちがあれば作成者へ ai_review_required メールを enqueue する", async () => {
    const ctx = createActionCtx(createIdentity());

    ctx.runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "batch-1",
        createdByUserId: "https://issuer.example|user-001",
      })
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce({
        userId: "https://issuer.example|user-001",
        email: "user@example.com",
        displayName: "ユーザー",
      });

    ctx.runMutation = vi.fn().mockResolvedValueOnce("email-job-1");

    await checkAiReviewRequiredHandler(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
    });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        templateType: "ai_review_required",
        payloadJson: JSON.stringify({ pendingCount: 2 }),
        recipientEmail: "user@example.com",
      }),
    );
  });

  it("needs_review 待ちが 0 なら何もしない", async () => {
    const ctx = createActionCtx(createIdentity());

    ctx.runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "batch-1",
        createdByUserId: "https://issuer.example|user-001",
      })
      .mockResolvedValueOnce(0);

    ctx.runMutation = vi.fn();

    await checkAiReviewRequiredHandler(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
    });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("作成者の email が未設定なら何もしない", async () => {
    const ctx = createActionCtx(createIdentity());

    ctx.runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "batch-1",
        createdByUserId: "https://issuer.example|user-001",
      })
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce({
        userId: "https://issuer.example|user-001",
        email: null,
        displayName: "ユーザー",
      });

    ctx.runMutation = vi.fn();

    await checkAiReviewRequiredHandler(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
    });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
