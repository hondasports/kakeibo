import { Button, Stack } from "@mui/material";
import { AnimatedButton } from "../../ui";

interface ExpenseFormActionsProps {
  isMultiMode: boolean;
  isOverExceeded: boolean;
  isSubmitting: boolean;
  onEnterMultiMode: () => void;
}

export function ExpenseFormActions({
  isMultiMode,
  isOverExceeded,
  isSubmitting,
  onEnterMultiMode,
}: ExpenseFormActionsProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        bottom: {
          xs: "calc(var(--size-bottom-nav-height) + env(safe-area-inset-bottom) + 8px)",
          md: "auto",
        },
        flexWrap: "wrap",
        justifyContent: "flex-end",
        minWidth: 0,
        position: { xs: "sticky", md: "static" },
        py: { xs: 1, md: 0 },
        zIndex: { xs: 1, md: "auto" },
        bgcolor: { xs: "background.paper", md: "transparent" },
      }}
    >
      {!isMultiMode && (
        <Button
          variant="text"
          size="small"
          onClick={onEnterMultiMode}
          aria-label="カテゴリ別の内訳を追加"
          sx={{ minHeight: 44 }}
        >
          カテゴリ別の内訳を追加
        </Button>
      )}
      <AnimatedButton
        type="submit"
        variant="contained"
        disabled={isSubmitting || isOverExceeded}
        loading={isSubmitting}
      >
        保存して次へ
      </AnimatedButton>
    </Stack>
  );
}
