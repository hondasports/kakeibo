import { ConvexError } from "convex/values";
import {
  getResolveExtractorModeErrorMessage,
  resolveExtractorMode,
} from "../../../lib/domain/receiptImageExtraction/mode";

export function getExtractorMode(appEnv: string | undefined): "mock" | "real" {
  const mode = process.env.RECEIPT_IMAGE_EXTRACTOR_MODE;
  const result = resolveExtractorMode({ appEnv, mode });

  if ("error" in result) {
    throw new ConvexError(getResolveExtractorModeErrorMessage(result.error));
  }

  return result.mode;
}
