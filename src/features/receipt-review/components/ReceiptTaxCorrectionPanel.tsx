import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import type { AmountBasis } from "../../../../lib/receiptTax/types";
import { MixedTaxItemCorrection } from "./MixedTaxItemCorrection";
import { ReceiptTaxSummary } from "./ReceiptTaxSummary";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";

const PRICE_OPTIONS = [
  ["included", "表示価格に税が含まれている"],
  ["excluded", "表示価格にあとから税が加算される"],
  ["perItem", "商品によって異なる"],
  ["unknown", "分からない"],
] as const;

const RATE_OPTIONS = [
  ["rate8", "すべて8%"],
  ["rate10", "すべて10%"],
  ["mixed", "8%と10%が混ざっている"],
  ["unknown", "分からない"],
] as const;

function itemAmount(item: ReviewItemValues) {
  return item.normalizedAmountYen ?? Number(item.amountYen || 0);
}

export function ReceiptTaxCorrectionPanel({
  draft,
  reviewForm,
  reviewItems,
  onFieldChange,
  onOpenItemEditing,
  taxSummaryUpdatingIndex,
  onTaxSummaryChange,
  imageDataUrl,
  taxUpdatingItemId,
  onTaxRateChange,
  onAmountBasisChange,
}: {
  draft: AiExpenseDraft | null;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
  onFieldChange: (field: keyof ReviewFormValues, value: string) => void;
  onOpenItemEditing: () => void;
  taxSummaryUpdatingIndex?: number | null;
  onTaxSummaryChange?: (index: number, change: TaxSummaryChange) => void;
  imageDataUrl?: string;
  taxUpdatingItemId?: string | null;
  onTaxRateChange?: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) => void;
  onAmountBasisChange?: (itemId: string, amountBasis: AmountBasis) => void;
}) {
  const receiptTotal = Number(reviewForm.amountYen || 0);
  const itemsTotal = useMemo(
    () => reviewItems.reduce((sum, item) => sum + itemAmount(item), 0),
    [reviewItems],
  );
  const allocatedTax = reviewItems.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0);
  const plannedTotal = reviewForm.registrationMode === "totalOnly" ? receiptTotal : itemsTotal;
  const subtotal = Math.max(0, plannedTotal - allocatedTax);
  const difference = receiptTotal - itemsTotal;
  const needsAttention =
    draft?.receiptTaxDecision?.resolutionStatus !== "verified" || difference !== 0;
  const draftId = draft?._id;
  const [expandedState, setExpandedState] = useState({ draftId, value: needsAttention });
  const [detailsState, setDetailsState] = useState({ draftId, value: false });
  const expanded = expandedState.draftId === draftId ? expandedState.value : needsAttention;
  const detailsExpanded = detailsState.draftId === draftId ? detailsState.value : false;
  const usesEstimate = draft?.receiptTaxDecision?.taxAmount.source === "estimated";
  const choseUnknown =
    reviewForm.priceTaxTreatment === "unknown" || reviewForm.taxRateComposition === "unknown";

  const changeChoice = (field: "priceTaxTreatment" | "taxRateComposition", value: string) => {
    const nextPriceTaxTreatment =
      field === "priceTaxTreatment" ? value : reviewForm.priceTaxTreatment;
    const nextTaxRateComposition =
      field === "taxRateComposition" ? value : reviewForm.taxRateComposition;
    onFieldChange(field, value);
    if (nextPriceTaxTreatment === "unknown" || nextTaxRateComposition === "unknown") {
      onFieldChange("registrationMode", "totalOnly");
    } else if (
      reviewForm.registrationMode === "totalOnly" &&
      nextPriceTaxTreatment !== undefined &&
      nextTaxRateComposition !== undefined
    ) {
      onFieldChange("registrationMode", "detailed");
    }
    if (field === "priceTaxTreatment" && value === "perItem") {
      onOpenItemEditing();
    }
    if (field === "taxRateComposition" && value === "mixed") {
      onOpenItemEditing();
    }
  };

  return (
    <Box component="section" aria-labelledby="receipt-tax-correction-heading">
      <Button
        aria-expanded={expanded}
        onClick={() => setExpandedState({ draftId, value: !expanded })}
        size="small"
        type="button"
        variant={needsAttention ? "contained" : "text"}
      >
        {expanded ? "税情報の修正を閉じる" : "税情報を修正"}
      </Button>
      <Collapse in={expanded}>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <Typography id="receipt-tax-correction-heading" component="h3" variant="subtitle1">
            税情報をかんたんに確認
          </Typography>
          <TextField
            autoComplete="off"
            fullWidth
            label="レシート合計"
            name="receipt-total"
            onChange={(event) =>
              onFieldChange("amountYen", event.target.value.replace(/[^\d]/g, ""))
            }
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            value={reviewForm.amountYen}
          />
          <FormControl>
            <FormLabel id="price-tax-treatment-label">1. 商品の表示価格はどれですか</FormLabel>
            <RadioGroup
              aria-labelledby="price-tax-treatment-label"
              name="price-tax-treatment"
              onChange={(event) => changeChoice("priceTaxTreatment", event.target.value)}
              value={reviewForm.priceTaxTreatment ?? ""}
            >
              {PRICE_OPTIONS.map(([value, label]) => (
                <FormControlLabel key={value} control={<Radio />} label={label} value={value} />
              ))}
            </RadioGroup>
          </FormControl>

          {reviewForm.priceTaxTreatment !== "unknown" ? (
            <FormControl>
              <FormLabel id="tax-rate-composition-label">2. 税率はどれですか</FormLabel>
              <RadioGroup
                aria-labelledby="tax-rate-composition-label"
                name="tax-rate-composition"
                onChange={(event) => changeChoice("taxRateComposition", event.target.value)}
                value={reviewForm.taxRateComposition ?? ""}
              >
                {RATE_OPTIONS.map(([value, label]) => (
                  <FormControlLabel key={value} control={<Radio />} label={label} value={value} />
                ))}
              </RadioGroup>
            </FormControl>
          ) : null}

          {choseUnknown ? (
            <Alert severity="info" variant="outlined">
              税を推測せず、レシート合計だけで保存します。商品明細は確認用に残りますが、履歴・予算・カテゴリ集計には使われません。
            </Alert>
          ) : null}

          {reviewForm.taxRateComposition === "mixed" ? (
            <MixedTaxItemCorrection
              draft={draft}
              imageDataUrl={imageDataUrl}
              items={reviewItems}
              onAmountBasisChange={onAmountBasisChange}
              onTaxRateChange={onTaxRateChange}
              priceTaxTreatment={reviewForm.priceTaxTreatment}
              updatingItemId={taxUpdatingItemId}
            />
          ) : null}

          <Alert
            aria-live="polite"
            severity={difference === 0 ? "success" : "warning"}
            variant="outlined"
          >
            <Stack spacing={0.5}>
              <Typography variant="body2">
                レシート合計：{receiptTotal.toLocaleString()}円
              </Typography>
              <Typography variant="body2">商品から計算：{itemsTotal.toLocaleString()}円</Typography>
              <Typography variant="body2">
                差額：{Math.abs(difference).toLocaleString()}円{difference === 0 ? "（一致）" : ""}
              </Typography>
              {difference !== 0 ? (
                <Typography variant="body2">
                  {reviewItems.some((item) => item.taxResolutionStatus === "unresolved")
                    ? "未確認商品の税率または表示価格区分が原因の可能性があります。商品ごとに確認するか、レシート合計だけで保存できます。"
                    : difference > 0
                      ? "商品合計に不足があります。明細・値引き・外税を確認するか、レシート合計だけで保存できます。"
                      : "商品合計が超過しています。重複明細・値引き・税の二重加算を確認するか、レシート合計だけで保存できます。"}
                </Typography>
              ) : null}
              <Typography sx={{ fontWeight: 600 }} variant="body2">
                保存予定：小計{subtotal.toLocaleString()}円 + 税{allocatedTax.toLocaleString()}円 ={" "}
                {plannedTotal.toLocaleString()}円{usesEstimate ? "（推定を含む）" : ""}
              </Typography>
              {reviewForm.registrationMode !== "totalOnly" ? (
                <Typography color="text.secondary" variant="body2">
                  「レシート合計だけ保存」を選ぶ場合：{receiptTotal.toLocaleString()}円
                </Typography>
              ) : null}
            </Stack>
          </Alert>

          <Button
            aria-expanded={detailsExpanded}
            onClick={() => setDetailsState({ draftId, value: !detailsExpanded })}
            size="small"
            sx={{ alignSelf: "flex-start" }}
            type="button"
            variant="text"
          >
            {detailsExpanded ? "詳しい税情報を閉じる" : "詳しい税情報"}
          </Button>
          <Collapse in={detailsExpanded}>
            <ReceiptTaxSummary
              draft={draft}
              onSummaryChange={onTaxSummaryChange}
              updatingIndex={taxSummaryUpdatingIndex}
            />
          </Collapse>
        </Stack>
      </Collapse>
    </Box>
  );
}
