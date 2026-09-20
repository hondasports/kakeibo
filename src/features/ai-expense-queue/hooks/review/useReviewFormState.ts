import { useState } from "react";
import {
  emptyReviewForm,
  mapDraftItemsToReviewItems,
  mapDraftToReviewForm,
} from "../../utils/mappers";
import { isDraftWithItems } from "../../utils/mappers";
import type {
  AiExpenseDraft,
  AiExpenseDraftItem,
  AiExpenseDraftWithItems,
  ReviewFormValues,
  ReviewItemValues,
} from "../../types/types";
import {
  applyReceiptCategory,
  assignCategoryToItems,
  assignDiscountTarget,
  initializeReviewCategoryState,
  prepareReviewItemsForSubmit,
} from "../../utils/reviewItemCategories";
import { isDiscountItemName, isDiscountLine } from "../../utils/discountItems";
import { applyReviewItemsTaxPreview } from "../../utils/reviewItemsTaxPreview";
import { reconcileNegativeLineWarnings } from "../../utils/negativeLineWarnings";

export function useReviewFormState({
  selectedReviewDraftId,
  selectedReviewDraft,
  localReviewItems,
  selectedReviewDraftDetails,
}: {
  selectedReviewDraftId: string | null;
  selectedReviewDraft: AiExpenseDraft | null;
  localReviewItems: AiExpenseDraftItem[] | undefined;
  selectedReviewDraftDetails: AiExpenseDraftWithItems | null | undefined;
}) {
  const [initializedReviewDraftId, setInitializedReviewDraftId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormValues>(emptyReviewForm);
  const [reviewItems, setReviewItems] = useState<ReviewItemValues[]>([]);
  const [isCategorySplit, setIsCategorySplit] = useState(false);

  if (
    selectedReviewDraft &&
    selectedReviewDraft._id === selectedReviewDraftId &&
    initializedReviewDraftId !== selectedReviewDraft._id
  ) {
    const mappedForm = mapDraftToReviewForm(selectedReviewDraft);
    const mappedItems = localReviewItems
      ? mapDraftItemsToReviewItems(localReviewItems)
      : isDraftWithItems(selectedReviewDraftDetails)
        ? mapDraftItemsToReviewItems(selectedReviewDraftDetails.items)
        : [];
    const categoryState = initializeReviewCategoryState(mappedItems, mappedForm.categoryId);
    setReviewForm({ ...mappedForm, categoryId: categoryState.receiptCategoryId });
    setReviewItems(
      applyReviewItemsTaxPreview(categoryState.items, {
        paidTotalYen: Number(mappedForm.amountYen),
        taxSummaries: selectedReviewDraft.taxSummaries,
        markerDefinitions: selectedReviewDraft.markerDefinitions,
      }),
    );
    setIsCategorySplit(categoryState.isCategorySplit);
    setInitializedReviewDraftId(selectedReviewDraft._id);
  }

  const resetForm = () => {
    setInitializedReviewDraftId(null);
    setReviewForm(emptyReviewForm);
    setReviewItems([]);
    setIsCategorySplit(false);
  };

  const prepareForDraft = () => {
    setInitializedReviewDraftId(null);
    setReviewForm(emptyReviewForm);
    setReviewItems([]);
    setIsCategorySplit(false);
  };

  const handleReviewFieldChange = (field: keyof ReviewFormValues, value: string) => {
    setReviewForm((current) => ({ ...current, [field]: value }));
    if (field === "priceTaxTreatment" || field === "taxRateComposition") {
      const nextPriceTaxTreatment =
        field === "priceTaxTreatment" ? value : reviewForm.priceTaxTreatment;
      const nextTaxRateComposition =
        field === "taxRateComposition" ? value : reviewForm.taxRateComposition;
      setReviewItems((current) =>
        applyReviewItemsTaxPreview(current, {
          paidTotalYen: Number(reviewForm.amountYen),
          taxSummaries: selectedReviewDraft?.taxSummaries,
          markerDefinitions: selectedReviewDraft?.markerDefinitions,
          priceTaxTreatment: nextPriceTaxTreatment as ReviewFormValues["priceTaxTreatment"],
          taxRateComposition: nextTaxRateComposition as ReviewFormValues["taxRateComposition"],
        }),
      );
    }
    if (field === "amountYen") {
      setReviewItems((current) =>
        applyReviewItemsTaxPreview(current, {
          paidTotalYen: Number(value),
          taxSummaries: selectedReviewDraft?.taxSummaries,
          markerDefinitions: selectedReviewDraft?.markerDefinitions,
          priceTaxTreatment: reviewForm.priceTaxTreatment,
          taxRateComposition: reviewForm.taxRateComposition,
        }),
      );
    }
    if (field === "categoryId") {
      setReviewItems((current) =>
        isCategorySplit
          ? prepareReviewItemsForSubmit(current, value)
          : applyReceiptCategory(current, value),
      );
    }
  };

  const handleReviewItemChange = (
    itemId: string,
    field: keyof Pick<ReviewItemValues, "itemName" | "amountYen" | "categoryId" | "lineType">,
    value: string,
  ) => {
    setReviewItems((current) => {
      const targetItem = current.find((item) => item.id === itemId);
      if (
        field === "categoryId" &&
        targetItem &&
        !isDiscountLine(targetItem.itemName, targetItem.lineType)
      ) {
        return assignCategoryToItems(current, [itemId], value);
      }
      const updated = current.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        if (field === "categoryId") {
          return {
            ...item,
            categoryId: value,
            discountTargetItemId: undefined,
          };
        }
        if (field === "amountYen") {
          if (value.trim() === "") {
            return { ...item, amountYen: value };
          }
          const amountNum = Number(value);
          if (!Number.isFinite(amountNum)) {
            return { ...item, amountYen: value };
          }
          if (item.taxResolutionStatus === "resolved" && item.amountBasis === "tax_included") {
            return {
              ...item,
              amountYen: value,
              printedAmountYen: amountNum,
              normalizedAmountYen: amountNum,
              warnings: reconcileNegativeLineWarnings(item.warnings, item.lineType, amountNum),
            };
          }
          return {
            ...item,
            amountYen: value,
            printedAmountYen: amountNum,
            warnings: reconcileNegativeLineWarnings(item.warnings, item.lineType, amountNum),
          };
        }
        if (field === "lineType") {
          return {
            ...item,
            lineType: value as ReviewItemValues["lineType"],
            discountTargetItemId: undefined,
            warnings: reconcileNegativeLineWarnings(
              item.warnings,
              value as ReviewItemValues["lineType"],
              Number(item.amountYen),
            ),
          };
        }
        if (field !== "itemName") {
          return { ...item, [field]: value };
        }
        const wasDiscount = isDiscountItemName(item.itemName);
        const isDiscount = isDiscountItemName(value);
        if (!wasDiscount && isDiscount) {
          return {
            ...item,
            itemName: value,
            categoryId: "",
            usesReceiptCategory: false,
            discountTargetItemId: undefined,
          };
        }
        if (wasDiscount && !isDiscount) {
          return {
            ...item,
            itemName: value,
            categoryId: reviewForm.categoryId,
            usesReceiptCategory: true,
            discountTargetItemId: undefined,
          };
        }
        return { ...item, itemName: value };
      });

      if (field !== "amountYen") {
        return updated;
      }

      const editedItem = updated.find((item) => item.id === itemId);
      if (editedItem?.amountYen.trim() === "") {
        return updated;
      }

      const paidTotalYen = Number(reviewForm.amountYen);
      return applyReviewItemsTaxPreview(updated, {
        paidTotalYen: Number.isFinite(paidTotalYen) ? paidTotalYen : undefined,
        taxSummaries: selectedReviewDraft?.taxSummaries,
        markerDefinitions: selectedReviewDraft?.markerDefinitions,
        priceTaxTreatment: reviewForm.priceTaxTreatment,
        taxRateComposition: reviewForm.taxRateComposition,
      });
    });
  };

  const handleAddReviewItem = () => {
    setReviewItems((current) => [
      ...current,
      {
        id: `new-${Date.now()}-${current.length}`,
        itemName: "",
        amountYen: "",
        categoryId: reviewForm.categoryId,
        usesReceiptCategory: true,
      },
    ]);
  };

  const handleRemoveReviewItem = (itemId: string) => {
    setReviewItems((current) => {
      const remaining = current
        .filter((item) => item.id !== itemId)
        .map((item) =>
          item.discountTargetItemId === itemId
            ? { ...item, categoryId: "", discountTargetItemId: undefined }
            : item,
        );
      const selectedRate =
        reviewForm.taxRateComposition === "rate8"
          ? 8
          : reviewForm.taxRateComposition === "rate10"
            ? 10
            : undefined;
      const selectedBasis =
        reviewForm.priceTaxTreatment === "excluded"
          ? "tax_excluded"
          : reviewForm.priceTaxTreatment === "included"
            ? "tax_included"
            : undefined;
      // Keep receipt choices only when they do not overwrite a later item choice.
      const preserveReceiptChoice = remaining.every(
        (item) =>
          (selectedRate === undefined || item.taxRatePercent === selectedRate) &&
          (selectedBasis === undefined || item.amountBasis === selectedBasis),
      );
      return applyReviewItemsTaxPreview(remaining, {
        paidTotalYen: Number(reviewForm.amountYen),
        taxSummaries: selectedReviewDraft?.taxSummaries,
        markerDefinitions: selectedReviewDraft?.markerDefinitions,
        ...(preserveReceiptChoice
          ? {
              priceTaxTreatment: reviewForm.priceTaxTreatment,
              taxRateComposition: reviewForm.taxRateComposition,
            }
          : {}),
      });
    });
  };

  const handleCategorySplitChange = (split: boolean) => {
    setIsCategorySplit(split);
    if (!split) {
      setReviewItems((current) => applyReceiptCategory(current, reviewForm.categoryId));
    }
  };

  const handleAssignCategoryToItems = (itemIds: string[], categoryId: string) => {
    setReviewItems((current) => assignCategoryToItems(current, itemIds, categoryId));
  };

  const handleDiscountTargetChange = (discountItemId: string, targetItemId: string) => {
    setReviewItems((current) => assignDiscountTarget(current, discountItemId, targetItemId));
  };

  return {
    initializedReviewDraftId,
    setInitializedReviewDraftId,
    reviewForm,
    reviewItems,
    isCategorySplit,
    setReviewForm,
    setReviewItems,
    resetForm,
    prepareForDraft,
    handleReviewFieldChange,
    handleReviewItemChange,
    handleAddReviewItem,
    handleRemoveReviewItem,
    handleCategorySplitChange,
    handleAssignCategoryToItems,
    handleDiscountTargetChange,
  };
}
