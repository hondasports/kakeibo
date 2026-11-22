type CssVariableName = `--${string}`;

function hexToRgbChannel(hexColor: string) {
  const normalizedHex = hexColor.replace("#", "");
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  return `${red} ${green} ${blue}`;
}

export const designTokens = {
  color: {
    brand: {
      sparrow: "#8B5E3C",
      paper: "#F7EDE2",
      leaf: "#A6B28B",
      coral: "#F4A27A",
      mist: "#AAB7C4",
    },
    primary: {
      light: "#F7EDE2",
      main: "#8B5E3C",
      dark: "#5F3D26",
      contrastText: "#ffffff",
    },
    secondary: {
      light: "#EEF2E7",
      main: "#6F7F55",
      dark: "#4F5C3C",
      contrastText: "#ffffff",
    },
    success: {
      main: "#5F7D4A",
    },
    warning: {
      main: "#C9734B",
    },
    error: {
      main: "#B85A4C",
    },
    text: {
      primary: "#3D2C22",
      secondary: "#765F4F",
      muted: "#9E9288",
    },
    surface: {
      canvas: "#FBF8F2",
      panel: "#FFFDF8",
      sunken: "#F7EDE2",
      accent: "#F2F5EA",
    },
    border: {
      subtle: "rgba(61, 44, 34, 0.12)",
      emphasis: "rgba(139, 94, 60, 0.34)",
      track: "rgba(61, 44, 34, 0.08)",
    },
    category: {
      default: "#8B5E3C",
    },
  },
  space: {
    "2xs": "4px",
    xs: "8px",
    sm: "12px",
    md: "16px",
    panel: "20px",
    lg: "24px",
    xl: "32px",
  },
  radius: {
    sm: "4px",
    md: "8px",
    /** ブランドロゴの枠（パネルより小さく丸める） */
    brandMark: "12px",
    lg: "16px",
    pill: "999px",
  },
  shadow: {
    panel: "0 12px 40px rgba(61, 44, 34, 0.08)",
  },
  size: {
    buttonMinHeight: "40px",
    // SPでは台帳の40pxより指先の44pxを優先する（MuiButton/MuiTab/MuiIconButton が使用）
    buttonMinHeightSp: "44px",
    inputMinHeight: "36px",
    bottomNavHeight: "56px",
  },
  layout: {
    contentMaxWidth: "1120px",
    shellInsetLg: "32px",
    shellInsetMd: "24px",
    shellInsetSm: "16px",
    shellInsetXs: "12px",
    workbenchSidebarMinWidth: "320px",
  },
  typography: {
    fontFamily:
      '"M PLUS Rounded 1c", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif',
    h4: {
      fontSize: "1.75rem",
      fontWeight: 700,
      lineHeight: 1.25,
      letterSpacing: "0",
    },
    h5: {
      fontSize: "1.25rem",
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: "0",
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 700,
      lineHeight: 1.35,
      letterSpacing: "0",
    },
    body1: {
      fontSize: "1rem",
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: "0",
    },
    body2: {
      fontSize: "0.875rem",
      fontWeight: 400,
      lineHeight: 1.45,
      letterSpacing: "0",
    },
    caption: {
      fontSize: "0.75rem",
      fontWeight: 500,
      lineHeight: 1.4,
      letterSpacing: "0",
    },
    button: {
      fontWeight: 700,
      letterSpacing: "0",
      textTransform: "none" as const,
    },
  },
} as const;

export const rootCssVariables: Record<CssVariableName, string> = {
  "--font-family-sans": designTokens.typography.fontFamily,
  "--color-brand-sparrow": designTokens.color.brand.sparrow,
  "--color-brand-paper": designTokens.color.brand.paper,
  "--color-brand-leaf": designTokens.color.brand.leaf,
  "--color-brand-coral": designTokens.color.brand.coral,
  "--color-brand-mist": designTokens.color.brand.mist,
  "--color-primary-main": designTokens.color.primary.main,
  "--color-primary-light": designTokens.color.primary.light,
  "--color-primary-dark": designTokens.color.primary.dark,
  "--color-secondary-main": designTokens.color.secondary.main,
  "--color-secondary-dark": designTokens.color.secondary.dark,
  "--color-success-main": designTokens.color.success.main,
  "--color-warning-main": designTokens.color.warning.main,
  "--color-error-main": designTokens.color.error.main,
  "--color-text-primary": designTokens.color.text.primary,
  "--color-text-secondary": designTokens.color.text.secondary,
  "--color-surface-canvas": designTokens.color.surface.canvas,
  "--color-surface-panel": designTokens.color.surface.panel,
  "--color-surface-sunken": designTokens.color.surface.sunken,
  "--color-surface-sunken-rgb": hexToRgbChannel(designTokens.color.surface.sunken),
  "--color-surface-accent": designTokens.color.surface.accent,
  "--color-border-subtle": designTokens.color.border.subtle,
  "--color-border-emphasis": designTokens.color.border.emphasis,
  "--color-border-track": designTokens.color.border.track,
  "--color-surface-canvas-rgb": hexToRgbChannel(designTokens.color.surface.canvas),
  "--color-surface-panel-rgb": hexToRgbChannel(designTokens.color.surface.panel),
  "--space-2xs": designTokens.space["2xs"],
  "--space-xs": designTokens.space.xs,
  "--space-sm": designTokens.space.sm,
  "--space-md": designTokens.space.md,
  "--space-panel": designTokens.space.panel,
  "--space-lg": designTokens.space.lg,
  "--space-xl": designTokens.space.xl,
  "--radius-sm": designTokens.radius.sm,
  "--radius-md": designTokens.radius.md,
  "--radius-lg": designTokens.radius.lg,
  "--radius-pill": designTokens.radius.pill,
  "--shadow-panel": designTokens.shadow.panel,
  "--size-button-min-height": designTokens.size.buttonMinHeight,
  "--size-input-min-height": designTokens.size.inputMinHeight,
  "--size-bottom-nav-height": designTokens.size.bottomNavHeight,
  "--layout-content-max-width": designTokens.layout.contentMaxWidth,
  "--layout-shell-inset-lg": designTokens.layout.shellInsetLg,
  "--layout-shell-inset-md": designTokens.layout.shellInsetMd,
  "--layout-shell-inset-sm": designTokens.layout.shellInsetSm,
  "--layout-shell-inset-xs": designTokens.layout.shellInsetXs,
  "--layout-workbench-sidebar-min-width": designTokens.layout.workbenchSidebarMinWidth,
};
