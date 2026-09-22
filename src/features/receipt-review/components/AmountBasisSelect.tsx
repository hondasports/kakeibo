import { MenuItem, TextField } from "@mui/material";
import type { AmountBasis } from "../../../../lib/receiptTax/types";

export function AmountBasisSelect({
  value,
  label = "金額種別",
  disabled,
  onChange,
}: {
  value: AmountBasis | undefined;
  label?: string;
  disabled?: boolean;
  onChange: (value: AmountBasis) => void;
}) {
  return (
    <TextField
      aria-label={label}
      disabled={disabled}
      label={label}
      onChange={(event) => onChange(event.target.value as AmountBasis)}
      select
      size="small"
      value={value ?? "unknown"}
    >
      <MenuItem value="tax_included">税込印字</MenuItem>
      <MenuItem value="tax_excluded">税抜印字</MenuItem>
      <MenuItem value="unknown">不明</MenuItem>
    </TextField>
  );
}
