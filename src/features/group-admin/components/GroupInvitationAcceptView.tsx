import type { GroupInvitationPreview } from "../../../../lib/domain/groups/groupInvitation";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { firstNameFieldNames, lastNameFieldNames } from "../lib/groupInvitationClerk";

type GroupInvitationAcceptViewProps = {
  invitation: GroupInvitationPreview | null;
  needsGroupSwitch: boolean;
  switchActiveGroup: boolean;
  onSwitchActiveGroupChange: (value: boolean) => void;
  onAcceptInvitation: () => void;
  error: string;
  firstName: string;
  isCompletingInvitation: boolean;
  lastName: string;
  missingProfileFields: string[];
  needsProfileDetails: boolean;
  needsAccountSwitch: boolean;
  onAccountSwitch: () => void;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onProfileDetailsSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function GroupInvitationAcceptView({
  invitation,
  needsGroupSwitch,
  switchActiveGroup,
  onSwitchActiveGroupChange,
  onAcceptInvitation,
  error,
  firstName,
  isCompletingInvitation,
  lastName,
  missingProfileFields,
  needsProfileDetails,
  needsAccountSwitch,
  onAccountSwitch,
  onFirstNameChange,
  onLastNameChange,
  onProfileDetailsSubmit,
}: GroupInvitationAcceptViewProps) {
  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
          {isCompletingInvitation ? <CircularProgress aria-label="招待を処理中" /> : null}
          <Box>
            <Typography component="h1" variant="h5">
              {needsAccountSwitch
                ? "招待先のアカウントで続ける"
                : needsProfileDetails
                  ? "招待を完了する"
                  : "グループ招待の確認"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {needsAccountSwitch
                ? "招待先のアカウントで続けるには、現在のアカウントからサインアウトしてください。"
                : needsProfileDetails
                  ? "認証を完了するため、名前を入力してください。参加は認証後に確認できます。"
                  : "招待先と表示するグループを確認してから、参加してください。"}
            </Typography>
          </Box>
          <Box id="clerk-captcha" sx={{ minHeight: 1 }} />

          {needsAccountSwitch ? (
            <Button
              disabled={isCompletingInvitation}
              onClick={onAccountSwitch}
              size="large"
              variant="contained"
            >
              アカウントを切り替える
            </Button>
          ) : null}

          {invitation ? (
            <Stack spacing={2} sx={{ width: "100%" }}>
              <Typography component="h2" variant="h6">
                {invitation.groupName}
              </Typography>
              <Typography variant="body2">
                {invitation.isExistingMember
                  ? "このグループにはすでに参加しています。"
                  : "参加すると、このグループのメンバーと家計データを共同利用できます。"}
              </Typography>
              <Typography variant="body2">
                {needsGroupSwitch
                  ? `参加後は、表示するグループが「${invitation.activeGroupName ?? "現在のグループ"}」から招待先に切り替わります。現在のグループからは退会しません。`
                  : "参加後は、このグループの家計簿を表示します。"}
              </Typography>
              {needsGroupSwitch ? (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={switchActiveGroup}
                      disabled={isCompletingInvitation}
                      onChange={(event) => onSwitchActiveGroupChange(event.target.checked)}
                    />
                  }
                  label="表示するグループの切り替えに同意する"
                />
              ) : null}
              <Button
                disabled={isCompletingInvitation || (needsGroupSwitch && !switchActiveGroup)}
                onClick={onAcceptInvitation}
                size="large"
                variant="contained"
              >
                招待を受け入れて参加する
              </Button>
            </Stack>
          ) : null}

          {needsProfileDetails ? (
            <Box component="form" onSubmit={onProfileDetailsSubmit} sx={{ width: "100%" }}>
              <Stack spacing={2}>
                <TextField
                  autoComplete="given-name"
                  disabled={isCompletingInvitation}
                  fullWidth
                  label="名"
                  onChange={(event) => onFirstNameChange(event.target.value)}
                  required={missingProfileFields.some((field) => firstNameFieldNames.has(field))}
                  value={firstName}
                />
                <TextField
                  autoComplete="family-name"
                  disabled={isCompletingInvitation}
                  fullWidth
                  label="姓"
                  onChange={(event) => onLastNameChange(event.target.value)}
                  required={missingProfileFields.some((field) => lastNameFieldNames.has(field))}
                  value={lastName}
                />
                <Button
                  disabled={isCompletingInvitation}
                  size="large"
                  type="submit"
                  variant="contained"
                >
                  招待を完了する
                </Button>
              </Stack>
            </Box>
          ) : null}

          {error ? (
            <Alert severity="error" variant="outlined" sx={{ width: "100%" }}>
              {error}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
