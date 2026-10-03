import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { CategorySettingsPanel } from "../components/CategorySettingsPanel";
import { GroupDangerZone, GroupSettingsPanel, GroupSettingsProvider } from "../../group-admin";
import { WeekDaySettingsPanel } from "../components/WeekDaySettingsPanel";
import { LineLinkSettingsPanel } from "../components/LineLinkSettingsPanel";
import { NotificationSettingsPanel } from "../components/NotificationSettingsPanel";
import { SettingsSectionErrorBoundary } from "../components/SettingsSectionErrorBoundary";

export function SettingsPage() {
  return (
    <Box className="app-main">
      <Stack spacing={3.5}>
        <Box>
          <Typography component="h1" variant="h5">
            設定
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
            グループやカテゴリ、週の設定を確認・管理します。
          </Typography>
        </Box>

        <Paper className="settings-ledger" data-testid="settings-ledger" elevation={0}>
          <GroupSettingsProvider>
            <Box className="settings-ledger-section">
              <SettingsSectionErrorBoundary>
                <GroupSettingsPanel defaultExpanded={false} />
              </SettingsSectionErrorBoundary>
            </Box>
            <Divider />
            <Box className="settings-ledger-section">
              <SettingsSectionErrorBoundary>
                <CategorySettingsPanel />
              </SettingsSectionErrorBoundary>
            </Box>
            <Divider />
            <Box className="settings-ledger-section">
              <SettingsSectionErrorBoundary>
                <WeekDaySettingsPanel />
              </SettingsSectionErrorBoundary>
            </Box>
            <Divider />
            <Box className="settings-ledger-section">
              <SettingsSectionErrorBoundary>
                <NotificationSettingsPanel />
              </SettingsSectionErrorBoundary>
            </Box>
            <Divider />
            <Box className="settings-ledger-section">
              <SettingsSectionErrorBoundary>
                <LineLinkSettingsPanel />
              </SettingsSectionErrorBoundary>
            </Box>
            <Divider />
            <Box className="settings-ledger-section settings-ledger-section--danger">
              <Typography component="h2" variant="h6">
                アカウント
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
                Suzumemoのアカウントと、あなたのみが利用している家計データを削除します。
              </Typography>
              <Button
                color="error"
                component={RouterLink}
                sx={{ mt: 1.5 }}
                to="/settings/account/delete"
                variant="outlined"
              >
                アカウントを削除
              </Button>
            </Box>
            <Divider />
            <Box className="settings-ledger-section settings-ledger-section--danger">
              <SettingsSectionErrorBoundary>
                <GroupDangerZone />
              </SettingsSectionErrorBoundary>
            </Box>
          </GroupSettingsProvider>
        </Paper>
      </Stack>
    </Box>
  );
}
