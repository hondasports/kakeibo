import type { SxProps, Theme } from "@mui/material/styles";

/**
 * 「保存して次へ」領域を900px未満で画面下部に固定する共通スタイル。
 * 週ナビ（--size-bottom-nav-height）とセーフエリアに被らないオフセットを含む。
 * 支出フォームのアクション行と収入フォームの保存ボタンで共用する。
 */
export const stickyBottomBarSx: SxProps<Theme> = {
  bottom: {
    xs: "calc(var(--size-bottom-nav-height) + env(safe-area-inset-bottom) + 8px)",
    md: "auto",
  },
  position: { xs: "sticky", md: "static" },
  py: { xs: 1, md: 0 },
  zIndex: { xs: 1, md: "auto" },
  bgcolor: { xs: "background.paper", md: "transparent" },
};
