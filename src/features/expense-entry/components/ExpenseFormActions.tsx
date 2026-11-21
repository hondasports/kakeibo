import { Button, Stack } from "@mui/material";
import { AnimatedButton } from "../../ui";
import { stickyBottomBarSx } from "./stickyBottomBarSx";

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
        ...stickyBottomBarSx,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        minWidth: 0,
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
