import {
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { SystemAdminEmptyState } from "../pages/SystemAdminPageFrame";
import type { SystemAdminListItem } from "../types";
import type { useSystemAdminManagement, StatusFilter } from "../hooks/useSystemAdminManagement";
import { formatDateTimeForDisplay } from "../../../utils/date";
import { displayLabel, systemAdminStatusLabels } from "../lib/displayLabels";

type AdminList = NonNullable<ReturnType<typeof useSystemAdminManagement>["list"]>;

type SystemAdminManagementAdminListProps = {
  list: AdminList | undefined;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  isSelf: (target: SystemAdminListItem) => boolean;
  onAction: (admin: SystemAdminListItem, action: "revoke" | "regrant") => void;
  onLoadMore: (cursor: string) => void;
};

export function SystemAdminManagementAdminList({
  list,
  statusFilter,
  onStatusFilterChange,
  isSelf,
  onAction,
  onLoadMore,
}: SystemAdminManagementAdminListProps) {
  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <Typography component="h3" variant="h5">
          管理者一覧
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="system-admin-status-label">状態</InputLabel>
          <Select
            label="状態"
            labelId="system-admin-status-label"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
          >
            <MenuItem value="active">有効</MenuItem>
            <MenuItem value="revoked">剥奪済み</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {list === undefined ? (
        <Typography aria-live="polite" role="status">
          管理者一覧を読み込んでいます…
        </Typography>
      ) : null}
      {list && list.page.length === 0 ? (
        <SystemAdminEmptyState message={`${statusLabel[statusFilter]} の管理者はいません。`} />
      ) : null}
      {list && list.page.length > 0 ? (
        <Stack spacing={1}>
          {list.page.map((item) => {
            const admin = item as SystemAdminListItem & { isSelf?: boolean };
            const self = Boolean(admin.isSelf) || isSelf(admin);
            const hasAnotherActiveAdmin = list.hasAnotherActiveAdmin ?? false;
            return (
              <Paper key={admin.id} sx={{ p: 2 }} variant="outlined">
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ justifyContent: "space-between" }}
                >
                  <BoxText item={admin} />
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Chip
                      color={admin.status === "active" ? "success" : "default"}
                      label={displayLabel(systemAdminStatusLabels, admin.status)}
                      size="small"
                    />
                    {admin.status === "active" ? (
                      <Button
                        color="error"
                        disabled={self || !hasAnotherActiveAdmin}
                        onClick={() => onAction(admin, "revoke")}
                        size="small"
                        variant="outlined"
                      >
                        剥奪
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onAction(admin, "regrant")}
                        size="small"
                        variant="outlined"
                      >
                        再付与
                      </Button>
                    )}
                  </Stack>
                </Stack>
                {self ? (
                  <Typography color="text.secondary" variant="caption">
                    自分自身は剥奪できません。
                  </Typography>
                ) : null}
                {!self && admin.status === "active" && !hasAnotherActiveAdmin ? (
                  <Typography color="text.secondary" variant="caption">
                    最後の有効な管理者のため剥奪できません。
                  </Typography>
                ) : null}
              </Paper>
            );
          })}
          {!list.isDone ? (
            <Button onClick={() => onLoadMore(list.continueCursor)}>次のページ</Button>
          ) : null}
        </Stack>
      ) : null}
    </>
  );
}

const statusLabel: Record<StatusFilter, string> = { active: "有効", revoked: "剥奪済み" };

function BoxText({ item }: { item: SystemAdminListItem }) {
  return (
    <Stack spacing={0.25}>
      <Typography component="h4" variant="h6">
        {item.displayName}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {item.email ?? "メールアドレス未登録"}
      </Typography>
      <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }} variant="body2">
        userId: {item.targetUserId}
      </Typography>
      <Typography color="text.secondary" variant="caption">
        付与: {formatDateTimeForDisplay(item.grantedAt)}
      </Typography>
      {item.revokedAt ? (
        <Typography color="text.secondary" variant="caption">
          剥奪: {formatDateTimeForDisplay(item.revokedAt)}
        </Typography>
      ) : null}
    </Stack>
  );
}
