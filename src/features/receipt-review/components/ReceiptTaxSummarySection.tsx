import { Box, Stack, Typography } from "@mui/material";
import { taxSummaryEvidenceLines } from "../../../../lib/domain/receipt/tax/summaryEvidence";
import type { AiExpenseDraft } from "../types/types";
import { ReceiptTaxSummaryEditor, type TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import { ReceiptTaxSummaryReadOnly } from "./ReceiptTaxSummaryReadOnly";

export type EditableTaxSummaryTarget = {
  summaryIndex: number;
  sourceIndex: number;
  message?: string;
};

export function ReceiptTaxSummarySection({
  draft,
  updatingIndex,
  onSummaryChange,
  editableSummaries,
  registerSummary,
}: {
  draft: AiExpenseDraft | null;
  updatingIndex?: number | null;
  onSummaryChange?: (index: number, change: TaxSummaryChange) => void;
  editableSummaries?: EditableTaxSummaryTarget[];
  registerSummary?: (target: string) => (node: HTMLElement | null) => void;
}) {
  const summaries = draft?.taxSummaries ?? [];
  const visibleSummaries: EditableTaxSummaryTarget[] =
    editableSummaries ?? summaries.map((_, index) => ({ summaryIndex: index, sourceIndex: index }));
  if (summaries.length === 0 || visibleSummaries.length === 0) {
    return null;
  }

  return (
    <Stack aria-label="税率別集計" spacing={1}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle2">
        税率別集計
      </Typography>
      {visibleSummaries.map(({ summaryIndex: index, sourceIndex, message }) => {
        const summary = summaries[index];
        if (!summary) return null;
        const isEditable =
          editableSummaries !== undefined ||
          summary.status === "ambiguous" ||
          summary.status === "contradictory" ||
          summary.status === "reconcilable" ||
          summary.status === "conflicting";
        const key = `${sourceIndex}-${index}`;
        const evidence = taxSummaryEvidenceLines(
          draft?.rawObservation?.source === "ai_ocr" ? draft.rawObservation.lines : undefined,
          summary.taxRatePercent,
          "target",
        );
        const sourceLabel =
          summary.valueOrigin?.source === "user"
            ? "ユーザー修正（保存済み）"
            : summary.valueOrigin?.source === "items"
              ? "商品から自動再計算"
              : evidence.some((line) => line.amountYen === summary.taxableAmountYen)
                ? "OCR原文の対象額"
                : "対象額の出所は未確認（推定を含む）";

        return (
          <Stack
            component="details"
            role="region"
            open={
              message || (summary.status !== "verified" && summary.status !== "coherent")
                ? true
                : undefined
            }
            key={key}
            ref={registerSummary?.(`tax-summary-${sourceIndex}`)}
            tabIndex={-1}
            aria-label={`${summary.taxRatePercent}%の税内訳を${isEditable ? "修正" : "確認"}`}
            spacing={0.25}
            sx={{
              border: "1px solid",
              borderColor: message ? "warning.main" : "divider",
              borderRadius: 1,
              p: 1,
            }}
          >
            <Box component="summary" sx={{ cursor: "pointer" }}>
              <Typography component="span" variant="body2">
                {summary.taxRatePercent}%の税内訳 · {sourceLabel} ·{" "}
                {isEditable ? "確認・再編集" : "確認"}
              </Typography>
              <ReceiptTaxSummaryReadOnly
                summary={{ ...summary, reasons: isEditable ? [] : summary.reasons }}
              />
            </Box>
            {summary.valueOrigin?.previousTaxableAmountYen !== undefined && (
              <Typography variant="body2" color="text.secondary">
                変更前の対象額 {summary.valueOrigin.previousTaxableAmountYen}円 → 現在{" "}
                {summary.taxableAmountYen}円
              </Typography>
            )}
            {draft?.rawObservation?.source === "ai_ocr" && (
              <Box aria-label="税内訳の原文の根拠">
                {[
                  ...evidence,
                  ...taxSummaryEvidenceLines(
                    draft.rawObservation.lines,
                    summary.taxRatePercent,
                    "tax",
                  ),
                ].map((line) => (
                  <Typography variant="body2" key={line.sourceLineIndex}>
                    原文 {line.sourceLineIndex + 1}行目：{line.rawText}
                  </Typography>
                ))}
                <Typography variant="caption">
                  OCR原文は画像の正確性を保証しません。相違があればレシート画像と照合してください。
                </Typography>
              </Box>
            )}
            {isEditable && (
              <ReceiptTaxSummaryEditor
                isSaving={updatingIndex != null || !onSummaryChange}
                summary={summary}
                summaryIndex={sourceIndex}
                reviewMessage={message}
                onChange={onSummaryChange ?? (() => {})}
              />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
