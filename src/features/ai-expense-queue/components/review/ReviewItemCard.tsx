import type { AmountBasis } from "../../../../../lib/receiptTax/types";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { formatYen } from "../../../../utils/currency";
import type { AiExpenseQueueCategory, AiExpenseDraft, ReviewItemValues } from "../../types/types";
import {
  isDiscountLine,
  isValidReviewItemAmount,
  sanitizeSignedYenInput,
} from "../../utils/discountItems";
import { isLowConfidenceItem } from "../../utils/reviewDialogUtils";
import {
  buildTaxContextFromReviewItem,
  toReceiptItemTaxViewModel,
} from "../../utils/receiptItemTaxViewModel";
import { formatTaxWarnings } from "../../utils/taxWarnings";
import { ReceiptItemTaxDetail } from "./ReceiptItemTaxDetail";
import { ReviewItemCategoryControl } from "./ReviewItemCategoryControl";
import { TaxRateSelect } from "./TaxRateSelect";

export type ReviewItemCardProps = {
  item: ReviewItemValues;
  index: number;
  categories: AiExpenseQueueCategory[];
  categoryNamesById: Map<string, string>;
  productItems: ReviewItemValues[];
  selectedReviewDraft: AiExpenseDraft | null;
  taxUpdatingItemId?: string | null;
  isCategorySplit: boolean;
  isExpanded: boolean;
  enableItemTaxEditing?: boolean;
  inlineTaxEditing?: boolean;
  disabled?: boolean;
  onAmountBasisChange?: (itemId: string, value: AmountBasis) => void;
  onItemChange: (
    itemId: string,
    field: keyof Pick<ReviewItemValues, "itemName" | "amountYen" | "categoryId" | "lineType">,
    value: string,
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onAssignCategoryToItems: (itemIds: string[], categoryId: string) => void;
  onDiscountTargetChange: (discountItemId: string, targetItemId: string) => void;
  onTaxRateChange?: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) => void;
  onToggleDetail: () => void;
};

export function ReviewItemCard({
  item,
  index,
  categories,
  categoryNamesById,
  productItems,
  selectedReviewDraft,
  taxUpdatingItemId,
  isCategorySplit,
  isExpanded,
  enableItemTaxEditing = false,
  inlineTaxEditing = false,
  disabled = false,
  onAmountBasisChange,
  onItemChange,
  onRemoveItem,
  onAssignCategoryToItems,
  onDiscountTargetChange,
  onTaxRateChange,
  onToggleDetail,
}: ReviewItemCardProps) {
  const uncategorized = !item.categoryId;
  const lowConfidence = isLowConfidenceItem(item);
  const categoryName = categoryNamesById.get(item.categoryId);
  const taxContext = buildTaxContextFromReviewItem(item);
  const taxVm = toReceiptItemTaxViewModel(item);
  const isTaxUpdating = disabled || taxUpdatingItemId === item.id;
  const showTaxRateSelect = enableItemTaxEditing && taxContext.status === "unresolved";
  const showRegistrationAmount =
    taxContext.status === "resolved" &&
    item.amountBasis === "tax_excluded" &&
    item.normalizedAmountYen != null;

  return (
    <Box
      key={item.id}
      sx={{
        border: "1px solid",
        borderColor: uncategorized || lowConfidence ? "warning.main" : "divider",
        borderRadius: 1,
        p: 1.5,
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
            <Chip label={`明細 ${index + 1}`} size="small" />
            {uncategorized && (
              <Chip color="warning" label="未分類" size="small" variant="outlined" />
            )}
            {lowConfidence && (
              <Chip color="warning" label="低信頼度" size="small" variant="outlined" />
            )}
            {taxContext.status === "unresolved" && (
              <Chip color="warning" label="要確認" size="small" variant="outlined" />
            )}
          </Stack>
          <IconButton
            disabled={disabled}
            aria-label={`${item.itemName || `明細 ${index + 1}`}を削除`}
            onClick={() => onRemoveItem(item.id)}
            size="small"
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>

        {item.warnings && item.warnings.length > 0 && (
          <Typography color="warning.main" variant="body2">
            {formatTaxWarnings(item.warnings)}
          </Typography>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            disabled={disabled}
            fullWidth
            label="明細名"
            error={!item.itemName.trim()}
            onChange={(event) => onItemChange(item.id, "itemName", event.target.value)}
            slotProps={{ htmlInput: { autoComplete: "off", name: `item-name-${index}` } }}
            value={item.itemName}
          />
          <TextField
            disabled={disabled}
            label="レシートの金額"
            error={
              !item.amountYen.trim() ||
              !isValidReviewItemAmount(item.itemName, Number(item.amountYen), item.lineType)
            }
            onChange={(event) =>
              onItemChange(
                item.id,
                "amountYen",
                sanitizeSignedYenInput(item.itemName, event.target.value, item.lineType),
              )
            }
            slotProps={{
              htmlInput: {
                autoComplete: "off",
                inputMode:
                  isDiscountLine(item.itemName, item.lineType) || item.lineType === "unknown"
                    ? "text"
                    : "numeric",
                name: `item-amount-${index}`,
              },
            }}
            sx={{ minWidth: { sm: 140 } }}
            value={item.amountYen}
            helperText={
              isDiscountLine(item.itemName, item.lineType)
                ? "割引額はマイナスで入力"
                : item.amountBasis === "tax_excluded" && taxContext.status === "resolved"
                  ? "税抜の印字額です。登録は下の税込額を使います"
                  : undefined
            }
          />
        </Stack>

        {Number(item.amountYen) < 0 && (
          <TextField
            disabled={disabled}
            fullWidth
            label="この負額行の種類"
            onChange={(event) => onItemChange(item.id, "lineType", event.target.value)}
            select
            value={item.lineType ?? (isDiscountLine(item.itemName) ? "discount" : "unknown")}
          >
            <MenuItem value="unknown">判定できない（要確認）</MenuItem>
            <MenuItem value="promotion_adjustment">販促・よりどり調整</MenuItem>
            <MenuItem value="discount">値引き・クーポン</MenuItem>
            <MenuItem value="item">通常商品</MenuItem>
          </TextField>
        )}

        {showRegistrationAmount && item.normalizedAmountYen != null && (
          <Typography color="text.secondary" variant="body2">
            登録額: {formatYen(item.normalizedAmountYen)}（税込）
          </Typography>
        )}

        {taxContext.status === "resolved" && (
          <Typography color="text.secondary" variant="body2">
            税率 {taxVm.taxRateLabel}
          </Typography>
        )}

        {inlineTaxEditing && enableItemTaxEditing && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TaxRateSelect
              disabled={isTaxUpdating}
              label={`${item.itemName || `明細 ${index + 1}`}の税率`}
              value={item.taxRatePercent}
              onChange={(value) => onTaxRateChange?.(item.id, value)}
            />
            <TextField
              select
              fullWidth
              disabled={isTaxUpdating}
              label={`${item.itemName || `明細 ${index + 1}`}の表示価格`}
              value={item.amountBasis ?? "unknown"}
              onChange={(event) =>
                onAmountBasisChange?.(item.id, event.target.value as AmountBasis)
              }
            >
              <MenuItem value="tax_included">税込</MenuItem>
              <MenuItem value="tax_excluded">税抜</MenuItem>
              <MenuItem value="unknown">不明</MenuItem>
            </TextField>
          </Stack>
        )}
        <Button
          endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={onToggleDetail}
          size="small"
          type="button"
          variant="text"
        >
          詳細（通常は不要）
        </Button>
        <Collapse in={isExpanded}>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            {showTaxRateSelect && !inlineTaxEditing && (
              <TaxRateSelect
                disabled={isTaxUpdating}
                onChange={(value) => onTaxRateChange?.(item.id, value)}
                value={item.taxRatePercent}
              />
            )}
            <ReceiptItemTaxDetail draft={selectedReviewDraft} item={item} />
          </Stack>
        </Collapse>

        <ReviewItemCategoryControl
          disabled={disabled}
          item={item}
          categories={categories}
          categoryName={categoryName}
          productItems={productItems}
          isCategorySplit={isCategorySplit}
          onAssignCategoryToItems={onAssignCategoryToItems}
          onDiscountTargetChange={onDiscountTargetChange}
        />
      </Stack>
    </Box>
  );
}
