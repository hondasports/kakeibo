import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SystemAdminAuditAction } from "../types";
import { actionOptions } from "../hooks/useSystemAdminAuditLog";

type AuditLogFiltersProps = {
  action: SystemAdminAuditAction | "";
  actor: string;
  target: string;
  groupId: string;
  fromDate: string;
  toDate: string;
  hasFilter: boolean;
  dateRangeInvalid: boolean;
  actorInvalid: boolean;
  targetInvalid: boolean;
  groupIdInvalid: boolean;
  onActionChange: (action: SystemAdminAuditAction | "") => void;
  onActorChange: (actor: string) => void;
  onTargetChange: (target: string) => void;
  onGroupIdChange: (groupId: string) => void;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
  onApply: () => void;
  onClear: () => void;
};

export function AuditLogFilters({
  action,
  actor,
  target,
  groupId,
  fromDate,
  toDate,
  hasFilter,
  dateRangeInvalid,
  actorInvalid,
  targetInvalid,
  groupIdInvalid,
  onActionChange,
  onActorChange,
  onTargetChange,
  onGroupIdChange,
  onFromDateChange,
  onToDateChange,
  onApply,
  onClear,
}: AuditLogFiltersProps) {
  const dateError = "開始日が終了日より後になっています";
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            error={dateRangeInvalid}
            helperText={dateRangeInvalid ? dateError : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
            label="開始日"
            onChange={(event) => onFromDateChange(event.target.value)}
            type="date"
            value={fromDate}
          />
          <TextField
            error={dateRangeInvalid}
            helperText={dateRangeInvalid ? dateError : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
            label="終了日"
            onChange={(event) => onToDateChange(event.target.value)}
            type="date"
            value={toDate}
          />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel id="system-admin-audit-action-label">操作</InputLabel>
            <Select
              label="操作"
              labelId="system-admin-audit-action-label"
              value={action}
              onChange={(event) =>
                onActionChange(event.target.value as SystemAdminAuditAction | "")
              }
            >
              {actionOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            error={actorInvalid}
            helperText={
              actorInvalid
                ? "IDの形式が正しくありません"
                : "操作を行ったユーザーの userId（完全一致）"
            }
            label="操作者の userId"
            onChange={(event) => onActorChange(event.target.value)}
            value={actor}
          />
          <TextField
            error={targetInvalid}
            helperText={
              targetInvalid
                ? "IDの形式が正しくありません"
                : "操作対象のユーザーの userId（完全一致）"
            }
            label="対象の userId"
            onChange={(event) => onTargetChange(event.target.value)}
            value={target}
          />
          <TextField
            error={groupIdInvalid}
            helperText={
              groupIdInvalid
                ? "IDの形式が正しくありません"
                : "移動元・移動先・直接操作の対象に含まれる操作を絞り込みます"
            }
            label="対象グループの groupId"
            onChange={(event) => onGroupIdChange(event.target.value)}
            value={groupId}
          />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            disabled={dateRangeInvalid || actorInvalid || targetInvalid || groupIdInvalid}
            onClick={onApply}
            variant="contained"
          >
            絞り込む
          </Button>
          {hasFilter ? <Button onClick={onClear}>条件をクリア</Button> : null}
        </Stack>
        <Typography color="text.secondary" variant="caption">
          開始日・終了日はこのブラウザのタイムゾーンの 0:00〜23:59 で判定し、両端を含みます。
          条件の変更は「絞り込む」を押した時点で反映されます。
        </Typography>
      </Stack>
    </Paper>
  );
}
