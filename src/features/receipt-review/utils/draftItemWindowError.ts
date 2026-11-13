import { ConvexError } from "convex/values";
import { getDraftItemWindowErrorMessage as getDraftItemWindowErrorMessageFromData } from "../../../../lib/domain/aiExpenseDrafts/userFacingErrors";

export function getDraftItemWindowErrorMessage(error: unknown): string | undefined {
  return error instanceof ConvexError
    ? getDraftItemWindowErrorMessageFromData(error.data)
    : undefined;
}
