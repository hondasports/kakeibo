import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAuthenticatedUserId } from "../users/auth";
import { ReceiptImageExtractionDomainError } from "../../lib/domain/receiptImageExtraction/rules";
import {
  createReceiptExtractionContextReader,
  createReceiptExtractorDeps,
} from "../../lib/convex/receiptImageExtraction/extractorDeps";
import type {
  ExtractReceiptFieldsArgs,
  ExtractReceiptFieldsResult,
  PublicExtractReceiptFieldsResult,
} from "../../lib/convex/receiptImageExtraction/types";
import {
  extractReceiptFields as extractReceiptFieldsUsecase,
  extractReceiptFieldsForCurrentGroup,
} from "../../lib/usecase/receiptImageExtraction";

export type {
  ExtractionConfidence,
  ExtractReceiptFieldsResult,
  ExtractReceiptItemResult,
} from "../../lib/convex/receiptImageExtraction/types";

export {
  validateImageDataUrl,
  validateExtractedDate,
} from "../../lib/convex/receiptImageExtraction/validators";
export { parseOpenAIResponse } from "../../lib/convex/receiptImageExtraction/parseExtraction";
export { getMockResult } from "../../lib/convex/receiptImageExtraction/mock";
export { getExtractorMode } from "../../lib/convex/receiptImageExtraction/mode";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  if (error instanceof ReceiptImageExtractionDomainError) throw new ConvexError(error.message);
  throw error;
}

export async function extractReceiptFieldsFromImage(
  args: ExtractReceiptFieldsArgs,
): Promise<ExtractReceiptFieldsResult> {
  try {
    return await extractReceiptFieldsUsecase(createReceiptExtractorDeps(), args);
  } catch (error) {
    convexError(error);
  }
}

export async function extractReceiptFieldsHandler(
  ctx: ActionCtx,
  args: ExtractReceiptFieldsArgs,
): Promise<ExtractReceiptFieldsResult> {
  // 解析処理自体は認証のみ確認する。公開 action 側で所属グループの有効カテゴリと同意を解決する。
  await requireAuthenticatedUserId(ctx);
  return extractReceiptFieldsFromImage(args);
}

/**
 * 公開 action の応答を旧クライアント互換の形にする。
 * 現在の抽出 schema は taxMarker を要求しないため、ライブ応答では markers[0] が
 * 旧実装の `taxMarker ?? markers[0] ?? ""` と常に一致する。
 */
export function toPublicExtractReceiptFieldsResult(
  result: ExtractReceiptFieldsResult,
): PublicExtractReceiptFieldsResult {
  return {
    ...result,
    items: result.items?.map((item) => ({
      ...item,
      amountYen: item.printedAmountYen,
      taxMarker: item.markers?.[0] ?? "",
    })),
  };
}

export const extractReceiptFields = action({
  args: {
    imageDataUrl: v.string(),
  },
  handler: async (ctx, args): Promise<PublicExtractReceiptFieldsResult> => {
    // 公開 action 側でグループ所属と外部 API 同意を確認する。
    try {
      const result = await extractReceiptFieldsForCurrentGroup(
        createReceiptExtractionContextReader(ctx),
        (extractArgs) => extractReceiptFieldsHandler(ctx, extractArgs),
        args,
      );
      return toPublicExtractReceiptFieldsResult(result);
    } catch (error) {
      convexError(error);
    }
  },
});
