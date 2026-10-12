import { Box, Button, Stack, Typography } from "@mui/material";
import type { AiExpenseDraft } from "../types/types";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import { ReceiptTaxSummary } from "./ReceiptTaxSummary";
import type { EditableTaxSummaryTarget } from "./ReceiptTaxSummarySection";

export type ReviewDialogReferenceSectionProps = {
  draft: AiExpenseDraft | null;
  canEditTax: boolean;
  editableSummaries: EditableTaxSummaryTarget[];
  open: boolean;
  busy: boolean;
  taxSummaryUpdatingIndex?: number | null;
  register: (target: string) => (node: HTMLElement | null) => void;
  onToggle: () => void;
  onTaxSummaryChange?: (index: number, change: TaxSummaryChange) => void;
  onResetToAiInterpretation: () => void;
};

export function ReviewDialogReferenceSection({
  draft,
  canEditTax,
  editableSummaries,
  open,
  busy,
  taxSummaryUpdatingIndex,
  register,
  onToggle,
  onTaxSummaryChange,
  onResetToAiInterpretation,
}: ReviewDialogReferenceSectionProps) {
  return (
    <>
      {canEditTax && (
        <Box
          component="section"
          ref={register("tax-summary")}
          tabIndex={-1}
          aria-label="税内訳を確認"
          inert={busy}
        >
          <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>
            税内訳を確認
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            商品から再計算できる対象額は自動更新します。原文の対象額・税額と異なる場合は、商品金額・割引・レシート画像を確認してください。税内訳の保存も即時に反映されます。
          </Typography>
          <ReceiptTaxSummary
            draft={draft}
            onSummaryChange={onTaxSummaryChange}
            updatingIndex={taxSummaryUpdatingIndex}
            editableSummaries={editableSummaries}
            registerSummary={register}
          />
        </Box>
      )}

      <Box component="details" ref={register("reference")} open={open} inert={busy}>
        <Typography
          component="summary"
          onClick={(event) => {
            event.preventDefault();
            onToggle();
          }}
          sx={{ cursor: "pointer" }}
        >
          読み取り原文・詳しい税情報（参考）
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {draft?.rawObservation?.lines.length ? (
            <Box component="ol" aria-label="OCR原文" sx={{ pl: 3, m: 0 }}>
              {draft.rawObservation.lines.map((line) => (
                <Typography component="li" variant="body2" key={line.sourceLineIndex}>
                  {line.rawText}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2">読み取り原文はありません。</Typography>
          )}
          {draft?.receiptInterpretation && draft.receiptUserOverride && (
            <Button
              disabled={busy}
              color="warning"
              type="button"
              onClick={onResetToAiInterpretation}
            >
              AI判定へ戻す
            </Button>
          )}
        </Stack>
      </Box>
    </>
  );
}
