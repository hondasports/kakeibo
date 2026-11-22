import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

export type GroupDeletionPreviewCount = {
  count: number;
  accuracy: "exact" | "at_least" | "unknown";
};

type GroupDeletionPreview = {
  groupName: string;
  members: GroupDeletionPreviewCount;
  invitations: GroupDeletionPreviewCount;
  sourceDocuments: GroupDeletionPreviewCount;
  expenseEntries: GroupDeletionPreviewCount;
  receipts: GroupDeletionPreviewCount;
  receiptImages: GroupDeletionPreviewCount;
  categories: GroupDeletionPreviewCount;
  aiDrafts: GroupDeletionPreviewCount;
  aiDraftItems: GroupDeletionPreviewCount;
  analysisBatches: GroupDeletionPreviewCount;
  analysisJobs: GroupDeletionPreviewCount;
  weekSessions: GroupDeletionPreviewCount;
  managementAuditLogs: GroupDeletionPreviewCount;
  monthlyInsights: GroupDeletionPreviewCount;
};

type ConfirmDeleteGroupDialogProps = {
  open: boolean;
  preview: GroupDeletionPreview | null | undefined;
  confirmationName: string;
  confirming: boolean;
  previewError?: boolean;
  onConfirmationNameChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatImpactLine(label: string, impact: GroupDeletionPreviewCount) {
  if (impact.accuracy === "unknown") return `${label}: 件数は削除処理中に確定します`;
  return `${label}: ${impact.count}件${impact.accuracy === "at_least" ? "以上" : ""}`;
}

export function ConfirmDeleteGroupDialog({
  open,
  preview,
  confirmationName,
  confirming,
  previewError = false,
  onConfirmationNameChange,
  onCancel,
  onConfirm,
}: ConfirmDeleteGroupDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const groupName = preview?.groupName ?? "";
  const isNameMatched = confirmationName.trim() === groupName.trim() && groupName.trim().length > 0;

  return (
    <Dialog
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      onClose={confirming ? undefined : onCancel}
      open={open}
    >
      <DialogTitle>グループを削除しますか？</DialogTitle>
      <DialogContent>
        <Stack aria-live="polite" spacing={2}>
          <Alert severity="error" variant="outlined">
            実行後すぐに利用できなくなります。家計データの完全削除はバックグラウンドで進み、
            この操作は取り消し・復元できません。
          </Alert>

          {previewError ? (
            <Alert severity="error" variant="outlined">
              削除対象の影響範囲を読み込めませんでした。戻ってからもう一度お試しください。
            </Alert>
          ) : preview ? (
            <Stack spacing={0.5}>
              <Typography data-testid="delete-group-target-name" variant="subtitle2">
                削除対象: {preview.groupName}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("所属メンバー", preview.members)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("支出/収入データ", preview.expenseEntries)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("レシート", preview.receipts)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("招待", preview.invitations)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("取り込み元ドキュメント", preview.sourceDocuments)} /{" "}
                {formatImpactLine("添付画像", preview.receiptImages)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("カテゴリ", preview.categories)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("AI解析下書き", preview.aiDrafts)} /{" "}
                {formatImpactLine("下書き明細", preview.aiDraftItems)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("AI解析バッチ", preview.analysisBatches)} /{" "}
                {formatImpactLine("AI解析ジョブ", preview.analysisJobs)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("週次セッション", preview.weekSessions)}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {formatImpactLine("管理操作の監査ログ", preview.managementAuditLogs)}
                {formatImpactLine("AI月次インサイト", preview.monthlyInsights)}
              </Typography>
            </Stack>
          ) : (
            <Typography color="text.secondary" variant="body2">
              削除対象の影響範囲を読み込んでいます。
            </Typography>
          )}

          <Typography color="text.secondary" variant="body2">
            users と Clerk アカウントは削除されません。ほかのグループにも影響しません。
          </Typography>

          <Typography variant="body2">
            削除を実行するには、グループ名「{groupName}」を入力してください。
          </Typography>

          <TextField
            autoComplete="off"
            autoFocus
            disabled={confirming || !preview || previewError}
            fullWidth
            label="確認用グループ名"
            onChange={(event) => onConfirmationNameChange(event.target.value)}
            value={confirmationName}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={confirming} onClick={onCancel}>
          戻る
        </Button>
        <Button
          color="error"
          disabled={confirming || !preview || previewError || !isNameMatched}
          onClick={onConfirm}
          startIcon={confirming ? <CircularProgress color="inherit" size={16} /> : undefined}
          variant="contained"
        >
          削除を開始する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
