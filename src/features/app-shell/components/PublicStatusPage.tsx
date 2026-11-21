import type { ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { designTokens } from "../../../designTokens";
import { SiteCreditsFooter } from "./SiteCreditsFooter";

type PublicStatusLinkAction = {
  label: string;
  href: string;
  variant?: "contained" | "outlined";
};

type PublicStatusButtonAction = {
  label: string;
  onClick: () => void;
  variant?: "contained" | "outlined";
};

type PublicStatusAction = PublicStatusLinkAction | PublicStatusButtonAction;

type PublicStatusLabelTone = "neutral" | "error";

type PublicStatusHeaderBrand = {
  alt: string;
  src: string;
  width?: number | string;
  /** lockup: ロゴ一体型 / panel: 角丸パネル内アイコン / plain: アイコンのみ */
  variant?: "plain" | "panel" | "lockup";
  /** plain のとき Suzumemo ワードマークを併記する */
  showWordmark?: boolean;
};

type PublicStatusPageProps = {
  label: string;
  labelTone?: PublicStatusLabelTone;
  title: string;
  description: string;
  headerBrand: PublicStatusHeaderBrand;
  primaryAction: PublicStatusAction;
  secondaryActions?: PublicStatusAction[];
  role?: string;
  children?: ReactNode;
};

function isLinkAction(action: PublicStatusAction): action is PublicStatusLinkAction {
  return "href" in action;
}

function renderAction(action: PublicStatusAction, variant: "contained" | "outlined") {
  const resolvedVariant = action.variant ?? variant;

  if (isLinkAction(action)) {
    return (
      <Button
        component="a"
        href={action.href}
        key={action.label}
        variant={resolvedVariant}
        sx={{ minWidth: { xs: "100%", sm: "auto" } }}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      key={action.label}
      onClick={action.onClick}
      variant={resolvedVariant}
      sx={{ minWidth: { xs: "100%", sm: "auto" } }}
    >
      {action.label}
    </Button>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: PublicStatusLabelTone }) {
  const isError = tone === "error";

  return (
    <Box
      sx={{
        alignItems: "center",
        bgcolor: isError ? "rgba(184, 90, 76, 0.12)" : designTokens.color.surface.sunken,
        borderRadius: designTokens.radius.pill,
        color: isError ? designTokens.color.error.main : designTokens.color.text.secondary,
        display: "inline-flex",
        gap: designTokens.space.xs,
        px: designTokens.space.sm,
        py: designTokens.space["2xs"],
      }}
    >
      <Box
        aria-hidden
        sx={{
          bgcolor: isError ? designTokens.color.error.main : designTokens.color.brand.leaf,
          borderRadius: "50%",
          flexShrink: 0,
          height: 8,
          width: 8,
        }}
      />
      <Typography
        component="span"
        sx={{
          fontSize: designTokens.typography.caption.fontSize,
          fontWeight: designTokens.typography.caption.fontWeight,
          lineHeight: designTokens.typography.caption.lineHeight,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function AccentBars() {
  return (
    <Stack spacing={0.75} sx={{ alignItems: "center", py: 0.5, width: "100%" }}>
      <Box
        sx={{
          bgcolor: designTokens.color.brand.sparrow,
          borderRadius: designTokens.radius.pill,
          height: 4,
          width: 120,
        }}
      />
      <Box
        sx={{
          bgcolor: designTokens.color.brand.leaf,
          borderRadius: designTokens.radius.pill,
          height: 4,
          width: 80,
        }}
      />
      <Box
        sx={{
          bgcolor: designTokens.color.brand.mist,
          borderRadius: designTokens.radius.pill,
          height: 4,
          width: 48,
        }}
      />
    </Stack>
  );
}

function HeaderBrand({ headerBrand }: { headerBrand: PublicStatusHeaderBrand }) {
  const { alt, src, width = 64, variant = "plain", showWordmark = false } = headerBrand;
  const image = (
    <Box
      alt={alt}
      component="img"
      src={src}
      sx={{
        display: "block",
        height: "auto",
        width,
      }}
    />
  );

  if (variant === "lockup") {
    return image;
  }

  if (variant === "panel") {
    return (
      <Box
        sx={{
          alignItems: "center",
          bgcolor: designTokens.color.surface.sunken,
          borderRadius: "12px",
          display: "inline-flex",
          justifyContent: "center",
          p: designTokens.space.sm,
        }}
      >
        {image}
      </Box>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ alignItems: "center" }}>
      {image}
      {showWordmark ? (
        <Stack spacing={0} sx={{ alignItems: "center" }}>
          <Typography component="p" sx={{ fontWeight: 700 }} variant="body1">
            Suzumemo
          </Typography>
          <Typography color="text.secondary" variant="caption">
            スズメモ
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}

export function PublicStatusPage({
  label,
  labelTone = "neutral",
  title,
  description,
  headerBrand,
  primaryAction,
  secondaryActions = [],
  role,
  children,
}: PublicStatusPageProps) {
  return (
    <Box className="auth-screen public-status-screen" component="main" role={role}>
      <Stack
        spacing={2.5}
        sx={{
          alignItems: "center",
          mx: designTokens.layout.shellInsetMd,
          textAlign: "center",
          width: "min(100%, 600px)",
        }}
      >
        <HeaderBrand headerBrand={headerBrand} />

        <Paper
          className="paper-panel"
          elevation={0}
          sx={{
            borderRadius: "16px",
            boxShadow: "0 12px 40px rgba(61, 44, 34, 0.08)",
            px: { xs: designTokens.space.lg, sm: designTokens.space.xl },
            py: { xs: designTokens.space.lg, sm: "calc(var(--space-xl) + var(--space-xs))" },
            width: "100%",
          }}
        >
          <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
            <StatusBadge label={label} tone={labelTone} />

            <Stack spacing={1.25} sx={{ width: "100%" }}>
              <Typography component="h1" variant="h5">
                {title}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {description}
              </Typography>
            </Stack>

            <AccentBars />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ flexWrap: "wrap", justifyContent: "center", width: "100%" }}
            >
              {renderAction(primaryAction, "contained")}
              {secondaryActions.map((action) => renderAction(action, "outlined"))}
            </Stack>

            {children}
          </Stack>
        </Paper>

        <SiteCreditsFooter />
      </Stack>
    </Box>
  );
}
