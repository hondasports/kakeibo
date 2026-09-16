import { ConvexError } from "convex/values";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionCtx } from "../../../convex/_generated/server";
import { snapshotReceiptDraftValues } from "../aiExpenseDrafts/receiptDataContract";
import {
  analyzeReceiptImageToDraftCore,
  assertReceiptImageConsent,
  getSafeFailureWarning,
} from "../receiptImageExtraction/analyzeReceiptImageCore";
import { getExtractorMode } from "../receiptImageExtraction/mode";
import { measureReceiptExtractionSave } from "../receiptImageExtraction/telemetry";
import type { ReceiptUserOverrideSnapshot } from "../../domain/aiExpenseDrafts/receiptDataContract";
import type { ReceiptAnalysisActionRunner } from "../../domain/receiptAnalysisJobs/actionRunner";
import { toJobRecord } from "./convexReceiptAnalysisStore";

export function createReceiptAnalysisActionRunner(ctx: ActionCtx): ReceiptAnalysisActionRunner {
  return {
    assertConsent: () => assertReceiptImageConsent(ctx),
    async getMyGroup() {
      const group: { _id: Id<"groups"> } | null = await ctx.runQuery(
        api.groups.queries.getMyGroup,
        {},
      );
      return group === null ? null : { id: group._id };
    },
    async getJob(jobId) {
      const job = await ctx.runQuery(internal.receiptAnalysisJobs.internal.getJobById, {
        jobId: jobId as Id<"receiptAnalysisImageJobs">,
      });
      return toJobRecord(job);
    },
    startAttempt: (jobId, expectedDraftId) =>
      ctx.runMutation(internal.receiptAnalysisJobs.internal.updateJobStatus, {
        jobId: jobId as Id<"receiptAnalysisImageJobs">,
        status: "running",
        expectedDraftId: expectedDraftId as Id<"aiExpenseDrafts"> | null,
      }),
    async waitForMockExtractor() {
      if (getExtractorMode(process.env.APP_ENV ?? "development") === "mock") {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    },
    async loadPreservedUserOverride(draftId, groupId) {
      const bundle = await ctx.runQuery(internal.aiExpenseDrafts.internal.getForReanalysis, {
        draftId: draftId as Id<"aiExpenseDrafts">,
        groupId: groupId as Id<"groups">,
      });
      const draft = bundle?.draft ?? null;
      if (!draft) return null;
      const value: ReceiptUserOverrideSnapshot<Id<"categories">> | undefined =
        draft.receiptUserOverride ??
        (draft.receiptTotalResolution?.candidates.some(
          (candidate) => candidate.source === "user_confirmed",
        )
          ? {
              source: "user",
              updatedAt: draft.updatedAt,
              fields: ["amountYen", "receiptTotalResolution"],
              values: snapshotReceiptDraftValues(draft, bundle?.items ?? []),
            }
          : undefined);
      return { draftUpdatedAt: draft.updatedAt, value };
    },
    async analyzeImage(args) {
      const draft = await analyzeReceiptImageToDraftCore(ctx, {
        imageDataUrl: args.imageDataUrl,
        imageFileName: args.imageFileName,
        telemetryId: args.telemetryId,
        preservedUserOverride: args.preservedUserOverride as
          | ReceiptUserOverrideSnapshot<Id<"categories">>
          | undefined,
      });
      return {
        id: draft._id,
        status: draft.status as "ready" | "needs_review" | "failed",
        updatedAt: draft.updatedAt,
        ...(draft.warnings === undefined ? {} : { warnings: draft.warnings }),
      };
    },
    async createFailureDraft(telemetryId, imageFileName, error) {
      const draft = await measureReceiptExtractionSave(telemetryId, "failure_draft", () =>
        ctx.runMutation(internal.aiExpenseDrafts.internal.createFailedDraftFromImageAnalysis, {
          warning: getSafeFailureWarning(error),
          imageFileName,
        }),
      );
      return {
        id: draft._id,
        status: draft.status as "failed",
        updatedAt: draft.updatedAt,
        ...(draft.warnings === undefined ? {} : { warnings: draft.warnings }),
      };
    },
    finalizeAttempt: (args) =>
      ctx.runMutation(internal.receiptAnalysisJobs.internal.finalizeAnalysisAttempt, {
        jobId: args.jobId as Id<"receiptAnalysisImageJobs">,
        expectedDraftId: args.expectedDraftId as Id<"aiExpenseDrafts"> | null,
        ...(args.expectedDraftUpdatedAt === undefined
          ? {}
          : { expectedDraftUpdatedAt: args.expectedDraftUpdatedAt }),
        newDraftId: args.newDraftId as Id<"aiExpenseDrafts">,
        status: args.status,
        ...(args.error === undefined ? {} : { error: args.error }),
      }),
    async incrementBatchProcessedCount(batchId) {
      await ctx.runMutation(internal.receiptAnalysisJobs.internal.incrementBatchProcessedCount, {
        batchId: batchId as Id<"receiptAnalysisBatches">,
      });
    },
    async finalizeBatchStatus(batchId) {
      await ctx.runMutation(internal.receiptAnalysisJobs.internal.finalizeBatchStatus, {
        batchId: batchId as Id<"receiptAnalysisBatches">,
      });
    },
    async getBatch(batchId) {
      const batch = await ctx.runQuery(internal.receiptAnalysisJobs.internal.getBatchById, {
        batchId: batchId as Id<"receiptAnalysisBatches">,
      });
      return batch === null
        ? null
        : batch.createdByUserId === undefined
          ? {}
          : { createdByUserId: batch.createdByUserId };
    },
    countNeedsReviewJobs: (batchId) =>
      ctx.runQuery(internal.receiptAnalysisJobs.internal.countNeedsReviewJobsByBatchId, {
        batchId: batchId as Id<"receiptAnalysisBatches">,
      }),
    async getUserEmail(userId) {
      const user = await ctx.runQuery(internal.users.internal.getUserById, { userId });
      return user?.email ?? null;
    },
    async enqueueAiReviewRequiredEmail(email, pendingCount) {
      await ctx.runMutation(internal.email.jobs.enqueueTransactionalEmailJob, {
        templateType: "ai_review_required",
        payloadJson: JSON.stringify({ pendingCount }),
        recipientEmail: email,
      });
    },
  };
}

export function asConvexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
}
