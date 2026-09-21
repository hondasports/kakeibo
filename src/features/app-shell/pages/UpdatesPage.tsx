import { Box, Stack, Typography } from "@mui/material";
import { designTokens } from "../../../designTokens";
import generatedUpdates from "../../../generated/product-updates.json?raw";
import { ProductUpdateList } from "../components/ProductUpdateList";
import { SiteCreditsFooter } from "../components/SiteCreditsFooter";

const productUpdates = JSON.parse(generatedUpdates) as {
  id: string;
  title: string;
  summary: string;
  version: string;
  publishedAt: string;
  items?: string[];
}[];

export function UpdatesPage() {
  const appVersion = import.meta.env.VITE_APP_VERSION ?? "local";

  return (
    <Box className="auth-screen" component="main">
      <Box className="app-main" sx={{ maxWidth: 640 }}>
        <Stack spacing={3}>
          <Box
            alt="Suzumemo スズメモ"
            component="img"
            src="/suzumemo-logo-lockup.svg"
            sx={{ display: "block", height: "auto", width: "min(180px, 60vw)" }}
          />
          <Box>
            <Typography component="h1" variant="h4">
              Suzumemoの更新履歴
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
              最近の新機能や改善内容をお知らせします。
            </Typography>
          </Box>
          <ProductUpdateList productUpdates={productUpdates} />
          <Box
            sx={{
              mt: 4,
              pt: 2,
              borderTop: `1px solid ${designTokens.color.border.subtle}`,
            }}
          >
            <Typography color="text.secondary" variant="caption">
              Version {appVersion}
            </Typography>
          </Box>
          <SiteCreditsFooter variant="ja" />
        </Stack>
      </Box>
    </Box>
  );
}
