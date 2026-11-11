import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { prepareReviewItemsForSubmit } from "./reviewItemCategories";
import { buildReplacementDraftItemFields } from "./reviewItemReplace";
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
  return judgeDraftAmountAndTax(
    {
      ...draft,
      documentType: form.documentType,
      shopName: form.shopName,
      date: form.date,
      amountYen,
      categoryId: form.categoryId,
      registrationMode: form.registrationMode,
      items: submittedItems.map((item) => {
        const amount = item.amountYen.trim() === "" ? Number.NaN : Number(item.amountYen);
        if (draft.items === undefined)
          return {
            ...item,
            _id: item.id,
            amountYen: amount,
            printedAmountYen: Number.isFinite(amount) ? amount : undefined,
            normalizedAmountYen: Number.isFinite(amount) ? item.normalizedAmountYen : undefined,
          };
        const saved = item.persistedItemId
          ? draft.items.find((entry) => entry._id === item.persistedItemId)
          : undefined;
        const previous = saved && {
          ...saved,
          groupId: "",
          draftId: "",
          confidence: saved.confidence ?? {},
          createdAt: 0,
          updatedAt: 0,
        };
        const replacement = buildReplacementDraftItemFields({
          groupId: "",
          draftId: "",
          now: 0,
          previous,
          item: {
            itemName: item.itemName,
            lineType: item.lineType,
            amountYen: amount,
            categoryId: item.categoryId,
            confirmedTaxRatePercent: item.confirmedTaxRatePercent,
          },
        });
        return replacement.success
          ? { ...replacement.fields, _id: item.id, discountTargetItemId: item.discountTargetItemId }
          : {
              ...item,
              _id: item.id,
              amountYen: amount,
              printedAmountYen: undefined,
              normalizedAmountYen: undefined,
            };
      }),
    },
    { inputKind: "form" },
  );
}
