import {
  getAiExpenseQueueDeleteErrorMessage,
  getAiExpenseQueueRegistrationErrorMessage,
  getAiExpenseQueueRetryErrorMessage,
  getAiExpenseQueueReviewErrorMessage,
} from "../../../../lib/domain/aiExpenseDrafts/userFacingErrors";

function logUserFacingError(context: string, error: unknown) {
  console.error(context, error);
}

export function toUserFacingRegistrationError(error: unknown) {
  logUserFacingError("AI expense queue registration failed", error);
  return getAiExpenseQueueRegistrationErrorMessage();
}

export function toUserFacingRetryError(error: unknown) {
  logUserFacingError("AI expense queue retry failed", error);
  return getAiExpenseQueueRetryErrorMessage();
}

export function toUserFacingDeleteError(error: unknown) {
  logUserFacingError("AI expense queue delete failed", error);
  return getAiExpenseQueueDeleteErrorMessage();
}

export function toUserFacingReviewError(error: unknown) {
  logUserFacingError("AI expense queue review save failed", error);
  return getAiExpenseQueueReviewErrorMessage();
}
