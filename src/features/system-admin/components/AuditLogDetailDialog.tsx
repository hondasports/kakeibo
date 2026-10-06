import { Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { SystemAdminAuditItem } from "../types";

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
            <Typography>結果: {selected.result}</Typography>
            <Typography>日時: {new Date(selected.createdAt).toLocaleString("ja-JP")}</Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              actor: {selected.actorDisplayName ?? selected.actorUserId ?? selected.actorType}
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              target:{" "}
              {selected.targetDisplayName ?? selected.targetUserId ?? selected.targetId ?? "-"}
            </Typography>
            {selected.sourceUserId ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                source user: {selected.sourceUserDisplayName ?? selected.sourceUserId}
              </Typography>
            ) : null}
            {selected.previousStatus || selected.newStatus ? (
              <Typography>
                status: {selected.previousStatus ?? "-"} → {selected.newStatus ?? "-"}
              </Typography>
            ) : null}
            {selected.sourceGroupId || selected.targetGroupId ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                group: {selected.sourceGroupNameSnapshot ?? selected.sourceGroupId ?? "-"} →{" "}
                {selected.targetGroupNameSnapshot ?? selected.targetGroupId ?? "-"}
              </Typography>
            ) : null}
            {selected.beforeActiveGroupId !== undefined ||
            selected.afterActiveGroupId !== undefined ? (
              <Typography sx={{ overflowWrap: "anywhere" }}>
                activeGroupId: {selected.beforeActiveGroupId ?? "未選択"} →{" "}
                {selected.afterActiveGroupId ?? "未選択"}
              </Typography>
            ) : null}
            {selected.beforeMembershipStatus !== undefined ||
            selected.afterMembershipStatus !== undefined ? (
              <Typography>
                membership: {selected.beforeMembershipStatus ?? "未所属"} →{" "}
                {selected.afterMembershipStatus ?? "未所属"}
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
            <Typography color="text.secondary" variant="caption">
              理由・検索語・token・secret・家計データは表示しません。
            </Typography>
          </Stack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
