import { Box, Stack, Typography } from "@mui/material";
import { CategorySettingsPanel } from "../components/CategorySettingsPanel";
import { SettingsSectionErrorBoundary } from "../components/SettingsSectionErrorBoundary";

export function CategoriesPage() {
  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <Typography component="h1" variant="h5">
          カテゴリ管理
        </Typography>
        <SettingsSectionErrorBoundary>
          <CategorySettingsPanel />
        </SettingsSectionErrorBoundary>
      </Stack>
    </Box>
  );
}
