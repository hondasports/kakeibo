import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { SystemAdminAuditItem } from "../types";
import { formatDateTimeWithSecondsForDisplay } from "../../../utils/date";
import {
  auditResultLabels,
  displayLabel,
  membershipStatusLabels,
  systemAdminStatusLabels,
} from "../lib/displayLabels";

type AuditLogDetailDialogProps = {
  selected: SystemAdminAuditItem | null;
  formatAction: (action: SystemAdminAuditItem["action"]) => string;
  onClose: () => void;
};

export function AuditLogDetailDialog({
  selected,
  formatAction,
  onClose,
}: AuditLogDetailDialogProps) {
  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={selected !== null}>
      <DialogTitle>監査ログ詳細</DialogTitle>
      <DialogContent>
        {selected ? (
          <Stack spacing={1}>
            <Typography>操作: {formatAction(selected.action)}</Typography>
            <Typography>結果: {displayLabel(auditResultLabels, selected.result)}</Typography>
            <Typography>日時: {formatDateTimeWithSecondsForDisplay(selected.createdAt)}</Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              操作者: {selected.actorDisplayName ?? selected.actorUserId ?? selected.actorType}
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              対象:{" "}
              {selected.targetDisplayName ?? selected.targetUserId ?? selected.targetId ?? "-"}
            </Typography>
            {selected.sourceUserId ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                移動元ユーザー: {selected.sourceUserDisplayName ?? selected.sourceUserId}
              </Typography>
            ) : null}
            {selected.previousStatus || selected.newStatus ? (
              <Typography>
                管理者権限:{" "}
                {selected.previousStatus
                  ? displayLabel(systemAdminStatusLabels, selected.previousStatus)
                  : "-"}{" "}
                →{" "}
                {selected.newStatus
                  ? displayLabel(systemAdminStatusLabels, selected.newStatus)
                  : "-"}
              </Typography>
            ) : null}
            {selected.sourceGroupId || selected.targetGroupId ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                グループ（移動元 → 移動先）:{" "}
                {selected.sourceGroupNameSnapshot ?? selected.sourceGroupId ?? "-"} →{" "}
                {selected.targetGroupNameSnapshot ?? selected.targetGroupId ?? "-"}
              </Typography>
            ) : null}
            {selected.beforeActiveGroupId !== undefined ||
            selected.afterActiveGroupId !== undefined ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                activeグループ: {selected.beforeActiveGroupId ?? "未選択"} →{" "}
                {selected.afterActiveGroupId ?? "未選択"}
              </Typography>
            ) : null}
            {selected.beforeMembershipStatus !== undefined ||
            selected.afterMembershipStatus !== undefined ? (
              <Typography>
                所属状態:{" "}
                {selected.beforeMembershipStatus
                  ? displayLabel(membershipStatusLabels, selected.beforeMembershipStatus)
                  : "未所属"}{" "}
                →{" "}
                {selected.afterMembershipStatus
                  ? displayLabel(membershipStatusLabels, selected.afterMembershipStatus)
                  : "未所属"}
              </Typography>
            ) : null}
            {selected.beforeOwnerCount !== undefined || selected.afterOwnerCount !== undefined ? (
              <Typography>
                owner数: {selected.beforeOwnerCount ?? "-"} → {selected.afterOwnerCount ?? "-"}
              </Typography>
            ) : null}
            {selected.beforeNotificationEnabled !== undefined ||
            selected.afterNotificationEnabled !== undefined ? (
              <Typography>
                通知設定: {selected.beforeNotificationEnabled ? "ON" : "OFF"} →{" "}
                {selected.afterNotificationEnabled ? "ON" : "OFF"}
              </Typography>
            ) : null}
            {selected.resultCount !== undefined ? (
              <Typography>検索結果の件数: {selected.resultCount}</Typography>
            ) : null}
            {selected.reason ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>理由: {selected.reason}</Typography>
            ) : null}
            <Typography color="text.secondary" variant="caption">
              検索語の中身・token・secret・家計データは表示しません。
            </Typography>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
