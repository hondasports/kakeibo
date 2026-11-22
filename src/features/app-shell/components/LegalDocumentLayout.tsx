import type { ReactNode } from "react";
import { Children, isValidElement, useEffect } from "react";
import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { SiteCreditsFooter } from "./SiteCreditsFooter";

type LegalDocumentLayoutProps = {
  title: string;
  effectiveDate: string;
  /** 最終改定日。未改定（制定日と同日）のときは表示しない */
  lastRevisedDate?: string;
  children: ReactNode;
};

type LegalSectionEntry = {
  id: string;
  title: string;
};

function collectSections(children: ReactNode): LegalSectionEntry[] {
  const sections: LegalSectionEntry[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<LegalSectionProps>(child) && child.type === LegalSection) {
      sections.push({ id: child.props.id ?? child.props.title, title: child.props.title });
    }
  });
  return sections;
}

export function LegalDocumentLayout({
  title,
  effectiveDate,
  lastRevisedDate,
  children,
}: LegalDocumentLayoutProps) {
  const sections = collectSections(children);

  // /terms#節 などフラグメント付きの直接アクセスでは、
  // SPA側で要素がマウントされた後にスクロールし直す
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    try {
      const target = document.getElementById(decodeURIComponent(hash));
      target?.scrollIntoView();
    } catch {
      // 不完全なパーセントエンコードのフラグメントでは何もしない
    }
  }, []);

  const revisedDateLabel =
    lastRevisedDate && lastRevisedDate !== effectiveDate ? `／最終改定日: ${lastRevisedDate}` : "";

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
              {revisedDateLabel}
            </Typography>
          </Box>

          {sections.length > 0 ? (
            <Box component="nav" aria-label="目次">
              <Typography component="p" sx={{ fontWeight: 700 }} variant="body2">
                目次
              </Typography>
              <Typography
                component="ul"
                sx={{ listStyle: "none", m: 0, mt: 0.5, p: 0 }}
                variant="body2"
              >
                {sections.map((section) => (
                  <Box component="li" key={section.id} sx={{ py: 0.25 }}>
                    <MuiLink href={`#${section.id}`} underline="hover" variant="body2">
                      {section.title}
                    </MuiLink>
                  </Box>
                ))}
              </Typography>
            </Box>
          ) : null}

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
  /** 目次・アンカーリンク用のid。未指定なら title をそのまま使う */
  id?: string;
  children: ReactNode;
};

export function LegalSection({ title, id, children }: LegalSectionProps) {
  return (
    <Stack id={id ?? title} spacing={1}>
      <Typography component="h2" variant="h6">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}
