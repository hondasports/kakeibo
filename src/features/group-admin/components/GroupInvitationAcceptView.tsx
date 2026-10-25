import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { firstNameFieldNames, lastNameFieldNames } from "../lib/groupInvitationClerk";

type GroupInvitationAcceptViewProps = {
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
                  : "グループ招待を処理中"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {needsAccountSwitch
                ? "招待先のアカウントで続けるには、現在のアカウントからサインアウトしてください。"
                : needsProfileDetails
                  ? "招待を受け入れるため、名前を入力してください。"
                  : "招待を受け取り次第、家計簿画面へ進みます。"}
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
