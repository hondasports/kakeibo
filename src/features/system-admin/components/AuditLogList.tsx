import { Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { auditResultLabels, displayLabel } from "../lib/displayLabels";
import { SystemAdminEmptyState } from "../pages/SystemAdminPageFrame";
import type { SystemAdminAuditItem } from "../types";
import { formatDateTimeWithSecondsInJapanTime } from "../../../utils/date";

type AuditLogListProps = {
  logs: { page: unknown[]; isDone: boolean; continueCursor: string } | undefined;
  hasFilter: boolean;
  formatAction: (action: SystemAdminAuditItem["action"]) => string;
  onSelect: (item: SystemAdminAuditItem) => void;
  onLoadMore: (cursor: string) => void;
};

export function AuditLogList({
  logs,
  hasFilter,
  formatAction,
  onSelect,
  onLoadMore,
}: AuditLogListProps) {
  if (logs === undefined) {
    return (
      <Typography aria-live="polite" role="status">
        監査ログを読み込んでいます…
      </Typography>
    );
  }

  if (logs.page.length === 0) {
    return (
      <SystemAdminEmptyState
        message={hasFilter ? "条件に一致する監査ログはありません。" : "監査ログはまだありません。"}
      />
    );
  }

  return (
    <Stack spacing={1}>
      {logs.page.map((raw) => {
        const item = raw as SystemAdminAuditItem;
        return (
          <Paper
            key={item.id}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item);
              }
            }}
            role="button"
            sx={{ cursor: "pointer", p: 2 }}
            tabIndex={0}
            variant="outlined"
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ justifyContent: "space-between" }}
            >
              <Stack spacing={0.25}>
                <Typography component="h3" variant="subtitle1">
                  {formatAction(item.action)}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {formatDateTimeWithSecondsInJapanTime(item.createdAt)}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                  variant="body2"
                >
                  操作者: {item.actorDisplayName ?? item.actorUserId ?? item.actorType}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                  variant="body2"
                >
                  対象: {item.targetDisplayName ?? item.targetUserId ?? item.targetId ?? "-"}
                </Typography>
              </Stack>
              <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                <Chip
                  color={item.result === "success" ? "success" : "error"}
                  label={displayLabel(auditResultLabels, item.result)}
                  size="small"
                />
                <Typography color="primary" variant="body2">
                  詳細を見る
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        );
      })}
      {logs.isDone ? (
        <Typography color="text.secondary" variant="body2">
          {logs.page.length}件を表示（最後）
        </Typography>
      ) : (
        <Button onClick={() => onLoadMore(logs.continueCursor)}>次のページ</Button>
      )}
    </Stack>
  );
}
