import { Box, Button, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../utils/currency";
import type { ReviewItemValues } from "../../types/types";
import type { ReviewGuidanceItem } from "../../utils/reviewGuidance";
import { isDiscountLine } from "../../utils/discountItems";
import { buildTaxContextFromReviewItem } from "../../utils/receiptItemTaxViewModel";

function amountLabel(item: ReviewItemValues): string {
  const trimmed = item.amountYen.trim();
  if (trimmed === "") return "未入力";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? formatYen(parsed) : `${trimmed}円`;
}

function taxLabel(item: ReviewItemValues): string {
  const context = buildTaxContextFromReviewItem(item);
  if (context.status !== "resolved") return "税率：未確定";
  const basis = context.amountBasis === "tax_included" ? "税込" : "税抜";
  return `${context.taxRatePercent}%・${basis}`;
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
  const context = buildTaxContextFromReviewItem(item);
  const hasRequired = issues.some((issue) => issue.required);
  const issueLabel = issues.length ? (hasRequired ? "修正必須" : "確認推奨") : undefined;
  const supplementary = [
    categoryName ?? "カテゴリ未設定",
    taxLabel(item),
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
        borderColor: hasRequired ? "error.main" : issues.length ? "warning.main" : "divider",
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
          sx={{ alignItems: { xs: "flex-start", sm: "center" }, flexWrap: { xs: "wrap", sm: "nowrap" } }}
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
          <Box sx={{ display: { xs: "none", sm: "block" }, width: 76, flexShrink: 0, textAlign: "right" }}>
            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
              {context.status === "resolved" ? `${context.taxRatePercent}%` : "未確定"}
            </Typography>
            {context.status === "resolved" && (
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {context.amountBasis === "tax_included" ? "税込" : "税抜"}
              </Typography>
            )}
          </Box>
          <Button
            size="small"
            variant="outlined"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle();
            }}
            sx={{ flexShrink: 0 }}
          >
            {open ? "閉じる" : "確認・修正"}
          </Button>
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
