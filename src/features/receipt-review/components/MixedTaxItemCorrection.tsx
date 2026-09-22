import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { AmountBasis } from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { buildTaxContextFromReviewItem } from "../utils/receiptItemTaxViewModel";
import { TaxRateSelect } from "./TaxRateSelect";

function needsTaxCorrection(item: ReviewItemValues) {
  return (
    buildTaxContextFromReviewItem(item).status === "unresolved" ||
    (item.taxReviewReasons?.length ?? 0) > 0
  );
}

function matchingLines(draft: AiExpenseDraft | null, item: ReviewItemValues | undefined) {
  const lines = draft?.rawObservation?.lines ?? [];
  if (!item?.itemName.trim()) return [];
  const normalizedName = item.itemName.normalize("NFKC").replace(/\s/g, "");
  return lines.filter((line) =>
    line.rawText.normalize("NFKC").replace(/\s/g, "").includes(normalizedName),
  );
}

function ReceiptReference({
  draft,
  imageDataUrl,
  activeItem,
}: {
  draft: AiExpenseDraft | null;
  imageDataUrl?: string;
  activeItem?: ReviewItemValues;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const highlightedLines = matchingLines(draft, activeItem);
  const reference = imageDataUrl ? (
    <Box sx={{ textAlign: "center" }}>
      <Box
        data-testid="receipt-image-coordinate-system"
        sx={{ display: "inline-flex", lineHeight: 0, maxWidth: "100%", position: "relative" }}
      >
        <Box
          alt={`${draft?.imageFileName ?? "レシート"}の確認画像`}
          component="img"
          src={imageDataUrl}
          sx={{ display: "block", maxHeight: 520, maxWidth: "100%", objectFit: "contain" }}
        />
        {highlightedLines.flatMap((line) =>
          line.boundingBox
            ? [
                <Box
                  aria-label={`${activeItem?.itemName ?? "対象商品"}の印字位置`}
                  key={line.sourceLineIndex}
                  sx={{
                    border: "3px solid",
                    borderColor: "warning.main",
                    bgcolor: "rgba(255, 193, 7, 0.18)",
                    left: `${line.boundingBox.left * 100}%`,
                    top: `${line.boundingBox.top * 100}%`,
                    width: `${line.boundingBox.width * 100}%`,
                    height: `${line.boundingBox.height * 100}%`,
                    pointerEvents: "none",
                    position: "absolute",
                  }}
                />,
              ]
            : [],
        )}
      </Box>
    </Box>
  ) : (
    <Stack aria-label="レシートOCR参照" component="ol" spacing={0.5} sx={{ m: 0, pl: 3 }}>
      {(draft?.rawObservation?.lines ?? []).map((line) => {
        const highlighted = highlightedLines.some(
          (candidate) => candidate.sourceLineIndex === line.sourceLineIndex,
        );
        return (
          <Typography
            component="li"
            key={line.sourceLineIndex}
            sx={highlighted ? { bgcolor: "warning.light", fontWeight: 700 } : undefined}
            variant="body2"
          >
            {line.rawText}
          </Typography>
        );
      })}
    </Stack>
  );

  return (
    <Box component="aside" aria-label="レシートを見ながら確認">
      <Button
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((current) => !current)}
        sx={{ display: { xs: "inline-flex", md: "none" }, mb: 1 }}
        type="button"
        variant="outlined"
      >
        {mobileOpen ? "レシートを閉じる" : "レシートを見る"}
      </Button>
      <Collapse in={mobileOpen} sx={{ display: { md: "none" } }}>
        {reference}
      </Collapse>
      <Box sx={{ display: { xs: "none", md: "block" }, position: "sticky", top: 8 }}>
        {reference}
      </Box>
    </Box>
  );
}

export function MixedTaxItemCorrection({
  draft,
  imageDataUrl,
  items,
  priceTaxTreatment,
  updatingItemId,
  onTaxRateChange,
  onAmountBasisChange,
}: {
  draft: AiExpenseDraft | null;
  imageDataUrl?: string;
  items: ReviewItemValues[];
  priceTaxTreatment?: string;
  updatingItemId?: string | null;
  onTaxRateChange?: (itemId: string, value: 0 | 8 | 10 | null) => void;
  onAmountBasisChange?: (itemId: string, value: AmountBasis) => void;
}) {
  const correctionItems = useMemo(() => items.filter(needsTaxCorrection), [items]);
  const resolvedCount = items.length - correctionItems.length;
  const [activeId, setActiveId] = useState<string>();
  const activeItem = correctionItems.find((item) => item.id === activeId) ?? correctionItems[0];
  const activeIndex = activeItem ? correctionItems.indexOf(activeItem) : -1;
  const totalsByRate = useMemo(
    () =>
      items.reduce(
        (totals, item) => {
          if (buildTaxContextFromReviewItem(item).status !== "resolved") return totals;
          const rate = item.taxRatePercent;
          if (rate !== 0 && rate !== 8 && rate !== 10) return totals;
          totals[rate] += item.normalizedAmountYen ?? Number(item.amountYen || 0);
          return totals;
        },
        { 0: 0, 8: 0, 10: 0 } as Record<0 | 8 | 10, number>,
      ),
    [items],
  );
  const showAmountBasis =
    activeItem?.taxRatePercent !== 0 &&
    (priceTaxTreatment === "perItem" || activeItem?.amountBasis === "unknown");

  return (
    <Box component="section" aria-labelledby="mixed-tax-item-heading">
      <Typography
        id="mixed-tax-item-heading"
        component="h4"
        sx={{ fontWeight: 700 }}
        variant="body1"
      >
        商品ごとの税率を確認
      </Typography>
      <Typography color="text.secondary" variant="body2">
        要確認の商品だけを上から直せます。AIで確定できた{resolvedCount}件はそのまま使います。
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", mt: 1 }}>
        <Chip label={`8% ${totalsByRate[8].toLocaleString()}円`} size="small" variant="outlined" />
        <Chip
          label={`10% ${totalsByRate[10].toLocaleString()}円`}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`非課税 ${totalsByRate[0].toLocaleString()}円`}
          size="small"
          variant="outlined"
        />
      </Stack>
      {correctionItems.length === 0 ? (
        <Alert severity="success" sx={{ mt: 1 }} variant="outlined">
          商品ごとの税率はすべて確認できました。
        </Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "minmax(240px, 0.9fr) minmax(280px, 1.1fr)",
            },
            mt: 1,
          }}
        >
          <ReceiptReference activeItem={activeItem} draft={draft} imageDataUrl={imageDataUrl} />
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
              {correctionItems.map((item, index) => (
                <Button
                  aria-current={item.id === activeItem?.id ? "step" : undefined}
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  size="small"
                  type="button"
                  variant={item.id === activeItem?.id ? "contained" : "outlined"}
                >
                  {index + 1}. {item.itemName || "名称未設定"}
                </Button>
              ))}
            </Stack>
            {activeItem ? (
              <Box
                sx={{ border: "1px solid", borderColor: "warning.main", borderRadius: 1, p: 1.5 }}
              >
                <Stack spacing={1.25}>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Chip
                      color="warning"
                      label={`要確認 ${activeIndex + 1}/${correctionItems.length}`}
                      size="small"
                    />
                    <Typography sx={{ fontWeight: 700 }}>{activeItem.itemName}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {Number(activeItem.amountYen || 0).toLocaleString()}円
                    </Typography>
                  </Stack>
                  <TaxRateSelect
                    disabled={updatingItemId === activeItem.id}
                    label={`${activeItem.itemName}の税率`}
                    onChange={(value) => onTaxRateChange?.(activeItem.id, value)}
                    value={activeItem.taxRatePercent}
                  />
                  {showAmountBasis ? (
                    <TextField
                      disabled={updatingItemId === activeItem.id}
                      label={`${activeItem.itemName}の表示価格`}
                      onChange={(event) =>
                        onAmountBasisChange?.(activeItem.id, event.target.value as AmountBasis)
                      }
                      select
                      size="small"
                      value={activeItem.amountBasis ?? "unknown"}
                    >
                      <MenuItem value="tax_included">税込</MenuItem>
                      <MenuItem value="tax_excluded">税抜</MenuItem>
                      <MenuItem value="unknown">不明</MenuItem>
                    </TextField>
                  ) : null}
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
