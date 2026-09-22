import { Alert, Stack, Typography } from "@mui/material";
import type { ReceiptAnalysisViewModel } from "../utils/receiptItemTaxViewModel";
import { formatYenAbs } from "../../../utils/currency";

export function ReceiptAnalysisStatusAlert({ analysis }: { analysis: ReceiptAnalysisViewModel }) {
  if (analysis.status === "resolved") {
    return (
      <Alert severity="success" variant="outlined">
        <Stack spacing={0.5}>
          <Typography variant="body2">レシート分析完了</Typography>
          <Typography variant="body2">支払合計 {analysis.paidTotalLabel}</Typography>
          <Typography color="text.secondary" variant="body2">
            登録用明細合計 {analysis.normalizedItemsTotalLabel}
          </Typography>
        </Stack>
      </Alert>
    );
  }

  return (
    <Alert severity="warning" variant="outlined">
      <Stack spacing={0.5}>
        <Typography variant="body2">分析結果を確認してください</Typography>
        {analysis.unresolvedCount > 0 && (
          <Typography variant="body2">
            税率を判定できない明細が{analysis.unresolvedCount}件あります
          </Typography>
        )}
        {analysis.showDifference && analysis.differenceYen !== undefined && (
          <Typography variant="body2">
            登録用明細合計 {analysis.normalizedItemsTotalLabel}（
            {analysis.differenceYen > 0 ? "支払合計が" : "明細合計が"}
            {formatYenAbs(analysis.differenceYen)}多い）
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}
