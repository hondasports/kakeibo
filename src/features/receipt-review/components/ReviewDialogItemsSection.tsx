import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../ai-expense-queue/types/types";
import type { ReviewGuidanceItem } from "../utils/reviewGuidance";
import type { AmountBasis } from "../../../../lib/receiptTax/types";
import { ReviewItemCard } from "./ReviewItemCard";
import { ReviewItemRow } from "./ReviewItemRow";
import { buildTaxContextFromReviewItem } from "../utils/receiptItemTaxViewModel";

export type ReviewDialogItemsSectionProps = {
  items: ReviewItemValues[];
  products: ReviewItemValues[];
  guidance: ReviewGuidanceItem[];
  expanded: Record<string, boolean>;
  taxDetails: Record<string, boolean>;
  busy: boolean;
  categories: AiExpenseQueueCategory[];
  categoryNames: Map<string, string>;
  isCategorySplit: boolean;
  draft: AiExpenseDraft | null;
  totalOnly: boolean;
  canEditTax: boolean;
  taxUpdatingItemId?: string | null;
  register: (target: string) => (node: HTMLElement | null) => void;
  onToggleItem: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
  onToggleTaxDetail: (itemId: string) => void;
  onCategorySplitChange: (split: boolean) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onItemChange: (
    itemId: string,
    field: keyof Pick<ReviewItemValues, "itemName" | "amountYen" | "categoryId" | "lineType">,
    value: string,
  ) => void;
  onAssignCategoryToItems: (itemIds: string[], categoryId: string) => void;
  onDiscountTargetChange: (discountItemId: string, targetItemId: string) => void;
  onTaxRateChange?: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) => void;
  onAmountBasisChange?: (itemId: string, amountBasis: AmountBasis) => void;
};

export function ReviewDialogItemsSection({
  items,
  products,
  guidance,
  expanded,
  taxDetails,
  busy,
  categories,
  categoryNames,
  isCategorySplit,
  draft,
  totalOnly,
  canEditTax,
  taxUpdatingItemId,
  register,
  onToggleItem,
  onOpenItem,
  onToggleTaxDetail,
  onCategorySplitChange,
  onAddItem,
  onRemoveItem,
  onItemChange,
  onAssignCategoryToItems,
  onDiscountTargetChange,
  onTaxRateChange,
  onAmountBasisChange,
}: ReviewDialogItemsSectionProps) {
  return (
    <Box
      component="fieldset"
      disabled={busy}
      inert={busy}
      sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
    >
      <Box
        component="section"
        ref={register("items")}
        tabIndex={-1}
        aria-label="商品一覧"
        sx={{ scrollMarginTop: 16 }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            mb: 1,
          }}
        >
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
            商品一覧（{items.length}件）
          </Typography>
          <Stack direction="row" spacing={1}>
            {products.length > 1 && (
              <Button
                disabled={busy}
                type="button"
                onClick={() => onCategorySplitChange(!isCategorySplit)}
              >
                {isCategorySplit ? "単一カテゴリに戻す" : "カテゴリを分ける"}
              </Button>
            )}
            <Button disabled={busy} type="button" onClick={onAddItem}>
              明細を追加
            </Button>
          </Stack>
        </Stack>
        {guidance
          .filter((issue) => issue.target === "items" && issue.scope !== "receipt")
          .map((issue) => (
            <Alert key={issue.id} severity={issue.required ? "error" : "info"} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2">
                {issue.required ? "修正必須" : "確認推奨"}
              </Typography>
              {issue.message}
            </Alert>
          ))}
        {totalOnly && (
          <Alert severity="info" sx={{ mb: 1 }}>
            税を推測せず、レシート合計だけで保存します。商品明細は確認用に残りますが、履歴・予算・カテゴリ集計には使われません。
          </Alert>
        )}
        {!items.length && (
          <Typography variant="body2">
            明細はありません。レシートの合計とカテゴリを確認してください。
          </Typography>
        )}
        {items.length > 0 && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              display: { xs: "none", sm: "flex" },
              px: 1.5,
              mb: 0.5,
              color: "text.secondary",
            }}
          >
            <Typography variant="caption" sx={{ width: "1.5em", flexShrink: 0 }}>
              No.
            </Typography>
            <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
              商品名・内容
            </Typography>
            <Typography
              variant="caption"
              sx={{ whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" }}
            >
              金額
            </Typography>
            <Typography variant="caption" sx={{ width: 88, flexShrink: 0, textAlign: "right" }}>
              税率
            </Typography>
            <Typography variant="caption" sx={{ width: 88, flexShrink: 0, textAlign: "center" }}>
              詳細
            </Typography>
          </Stack>
        )}
        <Stack spacing={1}>
          {items.map((item, index) => {
            const itemIssues = guidance.filter((issue) => issue.target === item.id);
            const isOpen = expanded[item.id] ?? false;
            const target = products.find((product) => product.id === item.discountTargetItemId);
            return (
              <ReviewItemRow
                key={item.id}
                item={item}
                index={index}
                issues={itemIssues}
                open={isOpen}
                registerRef={register(item.id)}
                onToggle={() => onToggleItem(item.id)}
                onOpen={() => onOpenItem(item.id)}
                busy={busy}
                categoryName={categoryNames.get(item.categoryId)}
                targetName={target?.itemName}
              >
                <Stack spacing={1}>
                  {itemIssues.map((issue) => (
                    <Alert key={issue.id} severity={issue.required ? "error" : "info"}>
                      {issue.message}
                    </Alert>
                  ))}
                  <ReviewItemCard
                    embedded
                    item={item}
                    index={index}
                    categories={categories}
                    categoryNamesById={categoryNames}
                    productItems={products}
                    selectedReviewDraft={draft}
                    isCategorySplit={isCategorySplit}
                    isExpanded={taxDetails[item.id] ?? false}
                    taxUpdatingItemId={taxUpdatingItemId}
                    disabled={busy}
                    enableItemTaxEditing={!!item.persistedItemId}
                    inlineTaxEditing
                    onAmountBasisChange={onAmountBasisChange}
                    onItemChange={onItemChange}
                    onRemoveItem={onRemoveItem}
                    onAssignCategoryToItems={onAssignCategoryToItems}
                    onDiscountTargetChange={onDiscountTargetChange}
                    onTaxRateChange={onTaxRateChange}
                    onToggleDetail={() => onToggleTaxDetail(item.id)}
                  />
                  {!canEditTax && buildTaxContextFromReviewItem(item).status === "unresolved" && (
                    <Typography variant="body2" color="text.secondary">
                      税内訳を読み取れていません。レシートと照合して税率・税込／税抜を確認してください。
                    </Typography>
                  )}
                </Stack>
              </ReviewItemRow>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
