import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { SiteCreditsFooter } from "./SiteCreditsFooter";

type LegalDocumentLayoutProps = {
  title: string;
  effectiveDate: string;
  children: ReactNode;
};

export function LegalDocumentLayout({ title, effectiveDate, children }: LegalDocumentLayoutProps) {
  return (
    <Box className="auth-screen" component="main" sx={{ alignContent: "start", py: 4 }}>
      <Box className="app-main" sx={{ maxWidth: 720 }}>
        <Stack spacing={3}>
          <Box
            alt="Suzumemo スズメモ"
            component="img"
            src="/suzumemo-logo-lockup.svg"
            sx={{ display: "block", height: "auto", width: "min(180px, 60vw)" }}
          />

          <Box>
            <Typography component="h1" variant="h4">
              {title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
              制定日: {effectiveDate}
            </Typography>
          </Box>

          <Stack component="article" spacing={3}>
            {children}
          </Stack>

          <SiteCreditsFooter variant="ja" />
        </Stack>
      </Box>
    </Box>
  );
}

type LegalSectionProps = {
  title: string;
  children: ReactNode;
};

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <Stack spacing={1}>
      <Typography component="h2" variant="h6">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}
