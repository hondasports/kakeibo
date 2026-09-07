import { Alert, Box, Button, DialogActions, Typography } from "@mui/material";

export function ReviewDialogActions({
  unavailable = false,
  reviewError,
  busy,
  requiredCount,
  recommendationCount,
  totalOnly,
  onClose,
  onSubmit,
  onReviewRequired,
}: {
  unavailable?: boolean;
  reviewError: string;
  busy: boolean;
  requiredCount: number;
  recommendationCount: number;
  totalOnly: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReviewRequired: () => void;
}) {
  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 2, sm: 3 },
        pt: 1,
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      {reviewError && (
        <Alert severity="error" aria-live="assertive" sx={{ mb: 1 }}>
          {reviewError} 入力は残っています。確認してもう一度保存してください。
        </Alert>
      )}
      <Typography
        role="status"
        variant="body2"
        color={requiredCount ? "error.main" : "text.secondary"}
      >
        {busy
          ? "処理中です。しばらくお待ちください。"
          : requiredCount
            ? `保存前に修正が必要：${requiredCount}件`
            : recommendationCount
              ? `確認推奨：${recommendationCount}件。確認事項を残したまま下書きを保存できます。`
              : "入力項目はそろっています。保存内容を確認してください。"}
      </Typography>
      <DialogActions sx={{ px: 0, py: 1.5, gap: 1 }}>
        <Button disabled={busy} onClick={onClose} type="button">
          閉じる
        </Button>
        <Button
          disabled={busy || unavailable}
          onClick={requiredCount ? onReviewRequired : onSubmit}
          type="button"
          variant="contained"
        >
          {requiredCount
            ? "修正が必要な項目へ"
            : totalOnly
              ? "レシート合計だけ保存"
              : "この内容で保存"}
        </Button>
      </DialogActions>
    </Box>
  );
}
