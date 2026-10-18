import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import type { ReviewItemValues } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import type { ReviewGuidanceItem } from "../../../../lib/domain/aiExpenseDrafts/reviewGuidance";
import { isDiscountLine } from "../../../../lib/domain/receipt/discountItems";
import { getReviewItemTaxConfirmation } from "../../../../lib/domain/aiExpenseDrafts/receiptItemTaxViewModel";
import {
  formatTaxRateLabel,
  getAmountBasisLabel,
} from "../../../../lib/domain/aiExpenseDrafts/receiptTaxLabels";

function amountLabel(item: ReviewItemValues): string {
  const trimmed = item.amountYen.trim();
  if (trimmed === "") return "未入力";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? formatYen(parsed) : `${trimmed}円`;
}

function taxLabel(item: ReviewItemValues): string {
  return `${formatTaxRateLabel(item.taxRatePercent)}・${getAmountBasisLabel(item.amountBasis ?? "unknown")}`;
}

export function ReviewItemRow({
  item,
  index,
  issues,
  open,
  registerRef,
  onToggle,
  onOpen,
  busy,
  categoryName,
  targetName,
  children,
}: {
  item: ReviewItemValues;
  index: number;
  issues: ReviewGuidanceItem[];
  open: boolean;
  registerRef: (node: HTMLElement | null) => void;
  onToggle: () => void;
  /** 展開内容にフォーカスが入ったら行を開いた状態に固定する */
  onOpen: () => void;
  busy: boolean;
  categoryName?: string;
  targetName?: string;
  children: React.ReactNode;
}) {
  const discount = isDiscountLine(item.itemName, item.lineType);
  const confirmation = getReviewItemTaxConfirmation(item);
  const hasRequired = issues.some((issue) => issue.required);
  const issueLabel = hasRequired ? "修正必須" : undefined;
  const supplementary = [
    categoryName ?? "カテゴリ未設定",
    taxLabel(item),
    confirmation.statusLabel,
    discount ? `割引対象：${targetName ?? "未確定"}` : undefined,
  ]
    .filter(Boolean)
    .join(" ・ ");

  return (
    <Box
      component="details"
      ref={registerRef}
      tabIndex={-1}
      open={open}
      sx={{
        border: "1px solid",
        borderColor: hasRequired ? "error.main" : "divider",
        borderRadius: 1.5,
        scrollMarginTop: 16,
      }}
    >
      <Box
        component="summary"
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
        sx={{
          cursor: "pointer",
          p: 1.5,
          listStyle: "none",
          "&::-webkit-details-marker": { display: "none" },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: { xs: "flex-start", sm: "center" },
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ width: "1.5em", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
          >
            {index + 1}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0, order: { xs: 0, sm: 0 } }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                display: "-webkit-box",
                WebkitLineClamp: { xs: 3, sm: 2 },
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                overflowWrap: "anywhere",
              }}
            >
              {item.itemName || `明細 ${index + 1}`}
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              flexShrink: 0,
              fontWeight: 600,
            }}
          >
            {amountLabel(item)}
          </Typography>
          <Box
            sx={{
              display: { xs: "none", sm: "block" },
              width: 88,
              flexShrink: 0,
              textAlign: "right",
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
              {formatTaxRateLabel(item.taxRatePercent)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {getAmountBasisLabel(item.amountBasis ?? "unknown")}
            </Typography>
            {confirmation.statusLabel && (
              <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                {confirmation.statusLabel}
              </Typography>
            )}
          </Box>
          <Box
            aria-hidden="true"
            sx={{
              width: 88,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 0.5,
              color: "text.secondary",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Typography variant="caption">{open ? "閉じる" : "詳細"}</Typography>
            <ExpandMoreIcon
              fontSize="small"
              sx={{
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: (theme) => theme.transitions.create("transform"),
              }}
            />
          </Box>
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: "block", sm: "none" }, mt: 0.5, overflowWrap: "anywhere" }}
        >
          {issueLabel && (
            <Box component="span" sx={{ color: hasRequired ? "error.main" : "warning.main" }}>
              {issueLabel} ・{" "}
            </Box>
          )}
          {supplementary}
        </Typography>
        {(issueLabel || discount) && (
          <Typography
            variant="caption"
            sx={{ display: { xs: "none", sm: "block" }, mt: 0.5, overflowWrap: "anywhere" }}
            color="text.secondary"
          >
            {issueLabel && (
              <Box component="span" sx={{ color: hasRequired ? "error.main" : "warning.main" }}>
                {issueLabel} ・{" "}
              </Box>
            )}
            {discount ? `割引対象：${targetName ?? "未確定"}` : ""}
          </Typography>
        )}
      </Box>
      <Box sx={{ px: 1.5, pb: 1.5 }} onFocusCapture={onOpen}>
        {children}
      </Box>
    </Box>
  );
}
