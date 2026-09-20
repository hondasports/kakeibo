import { useMemo, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export type SystemAdminMembershipOperation =
  | "add"
  | "remove"
  | "transfer"
  | "set_active"
  | "clear_active";

export type SystemAdminRoleOperation =
  | SystemAdminMembershipOperation
  | "role_change"
  | "owner_transfer";

export type MembershipDialogGroup = { id: string; name: string; status?: string };

type Props = {
  open: boolean;
  operation: SystemAdminRoleOperation;
  target: {
    id: string;
    displayName: string;
    email: string | null;
    activeGroupId: string | null;
  } | null;
  sourceGroup?: MembershipDialogGroup;
  targetGroup?: MembershipDialogGroup;
  environment: string;
  confirming: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  currentRole?: "owner" | "member";
  newRole?: "owner" | "member";
  sourceUser?: { id: string; displayName: string; email: string | null };
};

const labels: Record<SystemAdminRoleOperation, string> = {
  add: "グループに追加",
  remove: "グループから外す",
  transfer: "別グループへ移動",
  set_active: "activeグループに設定",
  clear_active: "activeグループを解除",
  role_change: "権限変更",
  owner_transfer: "owner付替え",
};

export function SystemAdminMembershipChangeDialog({
  open,
  operation,
  target,
  sourceGroup,
  targetGroup,
  environment,
  confirming,
  error,
  onCancel,
  onConfirm,
  currentRole,
  newRole,
  sourceUser,
}: Props) {
  const [reason, setReason] = useState("");
  const contextKey = `${open}:${operation}:${target?.id ?? ""}:${sourceGroup?.id ?? ""}:${targetGroup?.id ?? ""}`;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  if (prevContextKey !== contextKey) {
    setPrevContextKey(contextKey);
    if (open) setReason("");
  }

  const normalizedReason = reason.trim();
  const reasonError = useMemo(
    () =>
      normalizedReason.length < 1 || normalizedReason.length > 500
        ? "理由は1〜500文字で入力してください"
        : "",
    [normalizedReason],
  );
  const titleId = "system-admin-membership-dialog-title";
  const descriptionId = "system-admin-membership-dialog-description";
  const helperId = "system-admin-membership-reason-helper";
  const actionLabel =
    operation === "role_change"
      ? newRole === "owner"
        ? "ownerへ昇格"
        : "memberへ変更"
      : labels[operation];
  const subject = target
    ? `${target.displayName}（${target.email ?? "email未登録"}）`
    : "対象ユーザー";

  return (
    <Dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      onClose={confirming ? undefined : onCancel}
      open={open}
    >
      <DialogTitle id={titleId}>{actionLabel}を確認</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography id={descriptionId} variant="body2">
            {subject}（user document: {target?.id ?? "不明"}）に対して「{actionLabel}
            」を実行します。
            <br />
            {operation === "remove" && sourceGroup
              ? `対象グループ: ${sourceGroup.name}（${sourceGroup.id}）`
              : null}
            {operation === "add" && targetGroup
              ? `追加先: ${targetGroup.name}（${targetGroup.id}）`
              : null}
            {operation === "transfer" && sourceGroup
              ? `移動元: ${sourceGroup.name}（${sourceGroup.id}）`
              : null}
            {operation === "transfer" && targetGroup
              ? ` 移動先: ${targetGroup.name}（${targetGroup.id}）`
              : null}
            {operation === "set_active" && targetGroup
              ? `対象: ${targetGroup.name}（${targetGroup.id}）`
              : null}
            {operation === "role_change"
              ? `対象グループ: ${sourceGroup?.name ?? "-"}（${sourceGroup?.id ?? "-"}） / role: ${currentRole ?? "-"} → ${newRole ?? "-"}`
              : null}
            {operation === "owner_transfer" && sourceUser
              ? `付替え元: ${sourceUser.displayName}（${sourceUser.id}） → 付替え先: ${subject}`
              : null}
            <br />
            環境: {environment}。所属だけを変更し、家計データは移動しません。
          </Typography>
          <TextField
            autoFocus
            disabled={confirming}
            error={Boolean(reasonError)}
            fullWidth
            helperText={reasonError || "監査目的の理由を入力してください"}
            slotProps={{
              formHelperText: { id: helperId },
              htmlInput: { "aria-describedby": `${descriptionId} ${helperId}` },
            }}
            label="操作理由"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <Typography aria-live="polite" color="text.secondary" variant="caption">
            {normalizedReason.length}/500文字
          </Typography>
          {error ? (
            <Typography color="error" role="alert" variant="body2">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={confirming} onClick={onCancel}>
          戻る
        </Button>
        <Button
          color={operation === "remove" ? "error" : "primary"}
          disabled={confirming || Boolean(reasonError) || !target}
          onClick={() => onConfirm(normalizedReason)}
          startIcon={confirming ? <CircularProgress color="inherit" size={16} /> : undefined}
          variant="contained"
        >
          実行する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
