import { TextField } from "@mui/material";

interface ExpenseMemoFieldProps {
  memo: string;
  memoError: string;
  onMemoChange: (value: string) => void;
}

/**
 * 支出全体のメモ入力欄。単一項目モードと複数項目モードで共通の部品。
 */
export function ExpenseMemoField({ memo, memoError, onMemoChange }: ExpenseMemoFieldProps) {
  return (
    <TextField
      error={!!memoError}
      fullWidth
      helperText={memoError}
      id="expense-memo"
      label="メモ（任意）"
      minRows={2}
      multiline
      onChange={(event) => onMemoChange(event.target.value)}
      value={memo}
      slotProps={{ htmlInput: { "aria-label": "メモ" } }}
    />
  );
}
