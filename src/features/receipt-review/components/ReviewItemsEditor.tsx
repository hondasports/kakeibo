import AddIcon from "@mui/icons-material/Add";
import { Button, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { isDiscountLine } from "../../../../lib/domain/receipt/discountItems";
import { ReviewItemCard } from "./ReviewItemCard";

export function ReviewItemsEditor({
  categories,
  selectedReviewDraft,
  reviewItems,
  taxUpdatingItemId,
  onAddItem,
  onItemChange,
  onRemoveItem,
  isCategorySplit,
  onCategorySplitChange,
  onAssignCategoryToItems,
  onDiscountTargetChange,
  onTaxRateChange,
  enableItemTaxEditing = false,
}: {
  categories: AiExpenseQueueCategory[];
  selectedReviewDraft: AiExpenseDraft | null;
  reviewItems: ReviewItemValues[];
  receiptAmount: number;
  taxUpdatingItemId?: string | null;
  onAddItem: () => void;
  onItemChange: (
    itemId: string,
    field: keyof Pick<ReviewItemValues, "itemName" | "amountYen" | "categoryId" | "lineType">,
    value: string,
  ) => void;
  onRemoveItem: (itemId: string) => void;
  isCategorySplit: boolean;
  onCategorySplitChange: (split: boolean) => void;
  onAssignCategoryToItems: (itemIds: string[], categoryId: string) => void;
  onDiscountTargetChange: (discountItemId: string, targetItemId: string) => void;
  onTaxRateChange?: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) => void;
  enableItemTaxEditing?: boolean;
}) {
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());
  const productItems = useMemo(
    () => reviewItems.filter((item) => !isDiscountLine(item.itemName, item.lineType)),
    [reviewItems],
  );
  const categoryNamesById = useMemo(
    () => new Map(categories.map((category) => [category._id, category.name])),
    [categories],
  );

  const toggleDetail = (itemId: string) => {
    setExpandedDetailIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  return (
    <Stack spacing={1}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
        }}
      >
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
          明細
        </Typography>
        {productItems.length > 1 && (
          <Button
            onClick={() => onCategorySplitChange(!isCategorySplit)}
            size="small"
            type="button"
            variant="outlined"
          >
            {isCategorySplit ? "単一カテゴリに戻す" : "カテゴリを分ける"}
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button
          onClick={onAddItem}
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          type="button"
          variant="text"
        >
          明細を追加
        </Button>
      </Stack>

      {reviewItems.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          明細はありません。既存の単一カテゴリ下書きとして確認できます。
        </Typography>
      ) : (
        <Stack spacing={1}>
          {reviewItems.map((item, index) => (
            <ReviewItemCard
              key={item.id}
              categories={categories}
              categoryNamesById={categoryNamesById}
              index={index}
              isCategorySplit={isCategorySplit}
              isExpanded={expandedDetailIds.has(item.id)}
              enableItemTaxEditing={enableItemTaxEditing}
              item={item}
              productItems={productItems}
              selectedReviewDraft={selectedReviewDraft}
              taxUpdatingItemId={taxUpdatingItemId}
              onAssignCategoryToItems={onAssignCategoryToItems}
              onDiscountTargetChange={onDiscountTargetChange}
              onItemChange={onItemChange}
              onRemoveItem={onRemoveItem}
              onTaxRateChange={onTaxRateChange}
              onToggleDetail={() => toggleDetail(item.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
