import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

type SystemAdminAuthStateAction =
  | { label: string; onClick: () => void }
  | { label: string; to: string };

type SystemAdminAuthStateProps = {
  severity: "error" | "warning";
  title: string;
  message?: string;
  action: SystemAdminAuthStateAction;
};

export function SystemAdminAuthState({
  severity,
  title,
  message,
  action,
}: SystemAdminAuthStateProps) {
  const alertText =
    severity === "error"
      ? "管理者権限を確認できませんでした。"
      : "管理画面へのアクセス権限を確認できませんでした。";

  const actionNode =
    "to" in action ? (
      <Button component={RouterLink} to={action.to} variant="contained">
        {action.label}
      </Button>
    ) : (
      <Button onClick={action.onClick} variant="contained">
        {action.label}
      </Button>
    );

  return (
    <Box
      className="auth-screen"
      sx={{ alignItems: "center", display: "flex", minHeight: "100vh", p: 2 }}
    >
      <Paper
        className="auth-panel paper-panel"
        elevation={0}
        sx={{ mx: "auto", maxWidth: 520, p: 4, width: "100%" }}
      >
        <Stack spacing={2}>
          <Alert severity={severity} variant="outlined">
            {alertText}
          </Alert>
          <Typography component="h1" variant="h5">
            {title}
          </Typography>
          {message ? <Typography color="text.secondary">{message}</Typography> : null}
          {actionNode}
        </Stack>
      </Paper>
    </Box>
  );
}
