import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Alert, Box, Button, Chip, DialogActions, Typography } from "@mui/material";

export function ReviewDialogActions({
  unavailable = false,
  reviewError,
  busy,
  requiredCount,
  checkMismatchCount = 0,
  recommendationCount,
  unresolvedTaxItemCount = 0,
  totalOnly,
  onClose,
  onSubmit,
  onReviewRequired,
}: {
  unavailable?: boolean;
  reviewError: string;
  busy: boolean;
  /** 入力バリデーション由来の修正必須件数 */
  requiredCount: number;
  /** 金額確認・税率別集計の不一致件数 */
  checkMismatchCount?: number;
  /** 確認推奨件数（比較不能を含む） */
  recommendationCount: number;
  /** 税率または税込／税抜が未確定の明細数 */
  unresolvedTaxItemCount?: number;
  totalOnly: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReviewRequired: () => void;
}) {
  const fixCount = requiredCount + checkMismatchCount;
  const statusText = busy
    ? "処理中です。しばらくお待ちください。"
    : requiredCount > 0
      ? `保存前に修正が必要：${fixCount}件`
      : checkMismatchCount > 0
        ? `修正必須 ${fixCount}件。確認事項を残したまま下書きを保存できます。`
        : unresolvedTaxItemCount > 0
          ? `税率未確定 ${unresolvedTaxItemCount}件。商品ごとに税率を確認してください。`
          : recommendationCount > 0
            ? "確認事項があります。確認事項を残したまま下書きを保存できます。"
          : "確認結果：計算した金額が一致しています。OCRの読み取りがすべて正しいことを保証するものではありません。";
  const statusColor =
    requiredCount > 0 || checkMismatchCount > 0
      ? "error.main"
      : recommendationCount > 0
        ? "warning.main"
        : "text.secondary";
  const compactStatus = busy
    ? "処理中"
    : fixCount > 0
      ? `修正必須 ${fixCount}件`
      : unresolvedTaxItemCount > 0
        ? `税率未確定 ${unresolvedTaxItemCount}件`
        : recommendationCount > 0
          ? "確認事項あり"
        : "金額を確認済み";
  const submitLabel =
    requiredCount > 0
      ? "修正が必要な項目へ"
      : totalOnly
        ? "レシート合計だけ保存"
        : checkMismatchCount > 0 || recommendationCount > 0
          ? "下書きを保存"
          : "この内容で保存";

  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 2, sm: 3 },
        pt: 1,
        pb: "calc(env(safe-area-inset-bottom) + 8px)",
      }}
    >
      {reviewError && (
        <Alert severity="error" aria-live="assertive" sx={{ mb: 1 }}>
          {reviewError} 入力は残っています。確認してもう一度保存してください。
        </Alert>
      )}
      <Box sx={{ minHeight: 28, display: "flex", alignItems: "center" }}>
        <Typography
          role="status"
          variant="body2"
          color={statusColor}
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          {statusText}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={fixCount > 0 ? "error" : recommendationCount > 0 ? "warning" : "success"}
          icon={fixCount === 0 && recommendationCount === 0 ? <CheckCircleIcon /> : undefined}
          label={compactStatus}
          sx={{ display: { xs: "inline-flex", sm: "none" } }}
        />
      </Box>
      <DialogActions sx={{ px: 0, py: 1, gap: 1 }}>
        <Button
          disabled={busy}
          onClick={onClose}
          type="button"
          sx={{ display: { xs: "none", sm: "inline-flex" } }}
        >
          閉じる
        </Button>
        <Button
          disabled={busy || unavailable}
          onClick={requiredCount ? onReviewRequired : onSubmit}
          type="button"
          variant="contained"
          sx={{ flexGrow: { xs: 1, sm: 0 } }}
        >
          {submitLabel}
        </Button>
      </DialogActions>
    </Box>
  );
}
