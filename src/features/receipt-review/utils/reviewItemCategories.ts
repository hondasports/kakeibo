import type { ReviewItemValues } from "../types/types";
import { isDiscountLine } from "./discountItems";

function isProductItem(item: ReviewItemValues) {
  return !isDiscountLine(item.itemName, item.lineType);
}

function syncTargetedDiscounts(items: ReviewItemValues[]) {
  const categoriesByItemId = new Map(
    items.filter(isProductItem).map((item) => [item.id, item.categoryId]),
  );
  return items.map((item) => {
    if (!isDiscountLine(item.itemName, item.lineType) || !item.discountTargetItemId) {
      return item;
    }
    return {
      ...item,
      categoryId: categoriesByItemId.get(item.discountTargetItemId) ?? "",
    };
  });
}

function inferDiscountTargetItemId(
  items: ReviewItemValues[],
  discountIndex: number,
  discountCategoryId: string,
): string | undefined {
  const productItemsWithIndex = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isProductItem(item));

  const before = productItemsWithIndex.filter(({ index }) => index < discountIndex);
  const after = productItemsWithIndex.filter(({ index }) => index > discountIndex);

  const closestBefore = (
    candidates: Array<{ item: ReviewItemValues; index: number }>,
    matchCategory: boolean,
  ) => {
    const filtered =
      matchCategory && discountCategoryId
        ? candidates.filter(({ item }) => item.categoryId === discountCategoryId)
        : candidates;
    return filtered.sort((a, b) => b.index - a.index)[0]?.item.id;
  };

  const closestAfter = (
    candidates: Array<{ item: ReviewItemValues; index: number }>,
    matchCategory: boolean,
  ) => {
    const filtered =
      matchCategory && discountCategoryId
        ? candidates.filter(({ item }) => item.categoryId === discountCategoryId)
        : candidates;
    return filtered.sort((a, b) => a.index - b.index)[0]?.item.id;
  };

  return (
    closestBefore(before, true) ??
    closestBefore(before, false) ??
    closestAfter(after, true) ??
    closestAfter(after, false)
  );
}

export function initializeReviewCategoryState(
  items: ReviewItemValues[],
  receiptCategoryId: string,
) {
  const productItems = items.filter(isProductItem);
  const distinctCategoryIds = new Set(
    productItems.map((item) => item.categoryId).filter((categoryId) => categoryId.length > 0),
  );
  const soleItemCategoryId = distinctCategoryIds.size === 1 ? [...distinctCategoryIds][0] : "";
  const hasUncategorizedProducts = productItems.some((item) => !item.categoryId);
  const isCategorySplit =
    distinctCategoryIds.size > 1 ||
    (hasUncategorizedProducts &&
      !!receiptCategoryId &&
      !!soleItemCategoryId &&
      receiptCategoryId !== soleItemCategoryId);
  const effectiveReceiptCategoryId =
    !isCategorySplit && soleItemCategoryId
      ? soleItemCategoryId
      : receiptCategoryId || soleItemCategoryId;

  const initialized = items.map((item, index) => {
    if (!isProductItem(item)) {
      return {
        ...item,
        discountTargetItemId:
          item.discountTargetItemId ?? inferDiscountTargetItemId(items, index, item.categoryId),
      };
    }
    if (!isCategorySplit) {
      return {
        ...item,
        categoryId: effectiveReceiptCategoryId,
        usesReceiptCategory: true,
      };
    }
    const usesReceiptCategory =
      !item.categoryId ||
      (effectiveReceiptCategoryId.length > 0 && item.categoryId === effectiveReceiptCategoryId);
    return {
      ...item,
      categoryId: usesReceiptCategory ? effectiveReceiptCategoryId : item.categoryId,
      usesReceiptCategory,
    };
  });

  return {
    items: syncTargetedDiscounts(initialized),
    receiptCategoryId: effectiveReceiptCategoryId,
    isCategorySplit,
  };
}

export function applyReceiptCategory(items: ReviewItemValues[], categoryId: string) {
  return syncTargetedDiscounts(
    items.map((item) => {
      if (isProductItem(item)) {
        return { ...item, categoryId, usesReceiptCategory: true };
      }
      if (item.discountTargetItemId || item.categoryId) {
        return { ...item, categoryId };
      }
      return item;
    }),
  );
}

export function assignCategoryToItems(
  items: ReviewItemValues[],
  itemIds: string[],
  categoryId: string,
) {
  const selectedIds = new Set(itemIds);
  return syncTargetedDiscounts(
    items.map((item) =>
      selectedIds.has(item.id) && isProductItem(item)
        ? { ...item, categoryId, usesReceiptCategory: false }
        : item,
    ),
  );
}

export function assignDiscountTarget(
  items: ReviewItemValues[],
  discountItemId: string,
  targetItemId: string,
) {
  const target = items.find((item) => item.id === targetItemId && isProductItem(item));
  return items.map((item) =>
    item.id === discountItemId && isDiscountLine(item.itemName, item.lineType)
      ? {
          ...item,
          categoryId: target?.categoryId ?? "",
          discountTargetItemId: target?.id,
        }
      : item,
  );
}

export function prepareReviewItemsForSubmit(items: ReviewItemValues[], receiptCategoryId: string) {
  return syncTargetedDiscounts(
    items.map((item) =>
      isProductItem(item) && item.usesReceiptCategory
        ? { ...item, categoryId: receiptCategoryId }
        : item,
    ),
  );
}
