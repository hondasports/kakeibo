import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import {
  getReviewCategoryAggregateErrorMessage,
  getReviewDocumentTypeErrorMessage,
  getReviewFormErrorMessage,
  getReviewItemsErrorMessage,
  getReviewSubmitErrorMessage,
} from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";

export function getReviewFormError(reviewForm: ReviewFormValues): string | null {
  return getReviewFormErrorMessage(reviewForm);
}

export function getReviewDocumentTypeError(
  documentType: ReviewFormValues["documentType"],
): string | null {
  return getReviewDocumentTypeErrorMessage(documentType);
}

export function getReviewItemsError(reviewItems: ReviewItemValues[]): string | null {
  return getReviewItemsErrorMessage(reviewItems);
}

export function getReviewCategoryAggregateError(reviewItems: ReviewItemValues[]): string | null {
  return getReviewCategoryAggregateErrorMessage(reviewItems);
}

export function getReviewSubmitError(
  reviewForm: ReviewFormValues,
  reviewItems: ReviewItemValues[],
): string | null {
  return getReviewSubmitErrorMessage(reviewForm, reviewItems);
}
