import { ConvexError } from "convex/values";
import { api, internal } from "../../../convex/_generated/api";
import type { ActionCtx } from "../../../convex/_generated/server";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { ReceiptUserOverrideSnapshot } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { mapExtractionToDraftArgs } from "../../../lib/domain/aiExpenseDrafts/extractionMapping";
import { extractReceiptFieldsHandler } from "../../../convex/receiptImageExtraction/extraction";
import { measureReceiptExtractionSave } from "./telemetry";

export type AnalyzeReceiptImageCoreArgs = {
  imageDataUrl: string;
  imageFileName?: string;
  preservedUserOverride?: ReceiptUserOverrideSnapshot<Doc<"categories">["_id"]>;
  telemetryId?: string;
};

const GENERIC_FAILURE_WARNING = "画像解析に失敗しました";

/**
 * 下書きの warnings / ジョブの error として永続化され、グループメンバーに表示される文言を返す。
 * 利用者向けに意図された ConvexError の文字列だけをそのまま返し、
 * それ以外（設定値や内部状態を含みうる Error.message）は固定文言に置き換える。
 * 詳細はサーバーログにのみ残す（画像データ・秘密情報は含めない）。
 */
export function getSafeFailureWarning(err: unknown) {
  if (err instanceof ConvexError && typeof err.data === "string") {
    return err.data;
  }
  if (err instanceof Error) {
    console.error("receipt_extraction_unexpected_error", { name: err.name, message: err.message });
  }
  return GENERIC_FAILURE_WARNING;
}

export async function assertReceiptImageConsent(ctx: ActionCtx) {
  const consent: { hasAcceptedExternalApiConsent: boolean } = await ctx.runQuery(
    api.users.queries.getReceiptImageConsent,
    {},
  );
  if (!consent.hasAcceptedExternalApiConsent) {
    throw new ConvexError("Receipt image external API consent is required");
  }
}

export async function analyzeReceiptImageToDraftCore(
  ctx: ActionCtx,
  args: AnalyzeReceiptImageCoreArgs,
): Promise<Doc<"aiExpenseDrafts">> {
  let categories: Doc<"categories">[];
  let extracted;
  try {
    categories = await ctx.runQuery(api.categories.queries.listActive, {});
    extracted = await extractReceiptFieldsHandler(ctx, {
      imageDataUrl: args.imageDataUrl,
      telemetryId: args.telemetryId,
      categories: categories.map((category) => ({
        name: category.name,
        description: category.description,
      })),
    });
  } catch (err) {
    return await measureReceiptExtractionSave(args.telemetryId, "failure_draft", () =>
      ctx.runMutation(internal.aiExpenseDrafts.internal.createFailedDraftFromImageAnalysis, {
        warning: getSafeFailureWarning(err),
        imageFileName: args.imageFileName,
      }),
    );
  }

  return await measureReceiptExtractionSave(args.telemetryId, "result_draft", () =>
    ctx.runMutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
      ...mapExtractionToDraftArgs(extracted, categories, args.imageFileName),
      preservedUserOverride: args.preservedUserOverride,
    }),
  );
}
