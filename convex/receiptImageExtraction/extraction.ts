import type { ActionCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireAuthenticatedUserId } from "../users/auth";
import { ReceiptImageExtractionDomainError } from "../../lib/domain/receiptImageExtraction/rules";
import { createReceiptExtractorDeps } from "../../lib/convex/receiptImageExtraction/extractorDeps";
import type {
  ExtractReceiptFieldsArgs,
  ExtractReceiptFieldsResult,
} from "../../lib/convex/receiptImageExtraction/types";
import { extractReceiptFields as extractReceiptFieldsUsecase } from "../../lib/usecase/receiptImageExtraction";

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
  // 解析処理自体は認証を確認する。呼び出し元がグループと同意を確認する。
  await requireAuthenticatedUserId(ctx);
  return extractReceiptFieldsFromImage(args);
}
