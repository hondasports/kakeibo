import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { prepareReviewItemsForSubmit } from "./reviewItemCategories";
import type {
  AiExpenseDraftJudgmentInput,
  ReviewFormValues,
  ReviewItemValues,
} from "./reviewTypes";

export function judgeReviewFormAmountAndTax(
  draft: AiExpenseDraftJudgmentInput,
  form: ReviewFormValues,
  items: ReviewItemValues[],
) {
  const submittedItems = prepareReviewItemsForSubmit(items, form.categoryId);
  const amountYen = form.amountYen.trim() === "" ? undefined : Number(form.amountYen);
  return judgeDraftAmountAndTax({
    ...draft,
    documentType: form.documentType,
    shopName: form.shopName,
    date: form.date,
    amountYen,
    categoryId: form.categoryId,
    registrationMode: form.registrationMode,
    items: submittedItems.map((item) => ({
      ...item,
      _id: item.id,
      amountYen: item.amountYen.trim() === "" ? Number.NaN : Number(item.amountYen),
      printedAmountYen: item.amountYen.trim() === "" ? undefined : Number(item.amountYen),
      normalizedAmountYen: item.amountYen.trim() === "" ? undefined : item.normalizedAmountYen,
    })),
  });
}
