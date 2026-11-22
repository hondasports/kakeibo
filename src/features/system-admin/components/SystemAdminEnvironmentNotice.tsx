import { Alert, Typography } from "@mui/material";

/** 危険操作ダイアログの先頭に出す環境表示。Production は警告色の帯にする。 */
export function SystemAdminEnvironmentNotice({ environment }: { environment: string }) {
  if (environment === "production") {
    return (
      <Alert severity="warning" variant="filled">
        環境: Production — この操作は本番環境に影響します。
      </Alert>
    );
  }
  return (
    <Typography color="text.secondary" variant="body2">
      環境: {environment}
    </Typography>
  );
}
