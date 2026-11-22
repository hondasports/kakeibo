import { createTheme } from "@mui/material/styles";
import { designTokens, rootCssVariables } from "./designTokens";

export const theme = createTheme({
  spacing: 8,
  palette: {
    mode: "light",
    primary: designTokens.color.primary,
    secondary: designTokens.color.secondary,
    success: designTokens.color.success,
    warning: designTokens.color.warning,
    error: designTokens.color.error,
    background: {
      default: designTokens.color.surface.canvas,
      paper: designTokens.color.surface.panel,
    },
    text: {
      primary: designTokens.color.text.primary,
      secondary: designTokens.color.text.secondary,
    },
    divider: designTokens.color.border.subtle,
  },
  shape: {
    borderRadius: Number.parseInt(designTokens.radius.md, 10),
  },
  typography: {
    fontFamily: designTokens.typography.fontFamily,
    h4: {
      ...designTokens.typography.h4,
      letterSpacing: 0,
    },
    h5: {
      ...designTokens.typography.h5,
      letterSpacing: 0,
    },
    h6: {
      ...designTokens.typography.h6,
      letterSpacing: 0,
    },
    body1: {
      ...designTokens.typography.body1,
      letterSpacing: 0,
    },
    body2: {
      ...designTokens.typography.body2,
      letterSpacing: 0,
    },
    caption: {
      ...designTokens.typography.caption,
      letterSpacing: 0,
    },
    button: {
      fontWeight: designTokens.typography.button.fontWeight,
      letterSpacing: 0,
      textTransform: designTokens.typography.button.textTransform,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": rootCssVariables,
        body: {
          backgroundColor: designTokens.color.surface.canvas,
          color: designTokens.color.text.primary,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: () => ({
          minHeight: designTokens.size.buttonMinHeight,
          borderRadius: designTokens.radius.md,
          boxShadow: "none",
          paddingInline: designTokens.space.md,
          "&:hover": {
            boxShadow: "none",
          },
          // SPのタップ対象は44px以上に揃える。境界は900px（AppLayoutの isPC=up("md") の補集合。
          // MUIの not(md) は1200px以上にも適用されるため、up("md") の否定を明示する）
          "@media not all and (min-width: 900px)": {
            minHeight: designTokens.size.buttonMinHeightSp,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: () => ({
          "@media not all and (min-width: 900px)": {
            // 縦だけ大きい楕円にならないよう、幅も44pxに揃える
            minWidth: designTokens.size.buttonMinHeightSp,
            minHeight: designTokens.size.buttonMinHeightSp,
          },
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.radius.md,
          fontWeight: 700,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: designTokens.color.surface.panel,
          borderColor: designTokens.color.border.subtle,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 6,
          borderRadius: designTokens.radius.pill,
          backgroundColor: designTokens.color.border.track,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.radius.md,
          "&.Mui-selected": {
            backgroundColor: designTokens.color.primary.light,
            color: designTokens.color.primary.dark,
            "& .MuiListItemIcon-root": {
              color: designTokens.color.primary.dark,
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderRadius: designTokens.radius.md,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.radius.md,
          backgroundColor: designTokens.color.surface.accent,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: designTokens.radius.pill,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: () => ({
          minHeight: designTokens.size.buttonMinHeight,
          paddingInline: designTokens.space.md,
          "@media not all and (min-width: 900px)": {
            minHeight: designTokens.size.buttonMinHeightSp,
          },
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        size: "small",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: designTokens.size.inputMinHeight,
          borderRadius: designTokens.radius.md,
          backgroundColor: designTokens.color.surface.panel,
        },
      },
    },
  },
});
