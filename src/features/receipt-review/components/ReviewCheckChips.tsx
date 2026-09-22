import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Chip, Stack } from "@mui/material";

export type ReviewCheckChipsProps = {
  fixCount: number;
  recommendationCount: number;
  basisConflictItemCount: number;
  unresolvedTaxItemCount: number;
};

export function ReviewCheckChips({
  fixCount,
  recommendationCount,
  basisConflictItemCount,
  unresolvedTaxItemCount,
}: ReviewCheckChipsProps) {
  return (
    <Stack
      component="section"
      aria-label="確認件数"
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", rowGap: 0.5 }}
    >
      <Chip
        size="small"
        variant="outlined"
        color={fixCount ? "error" : "success"}
        icon={fixCount ? undefined : <CheckCircleIcon />}
        label={`修正必須 ${fixCount}件`}
      />
      <Chip
        size="small"
        variant="outlined"
        color={recommendationCount ? "warning" : "success"}
        icon={recommendationCount ? undefined : <CheckCircleIcon />}
        label={
          basisConflictItemCount > 0
            ? `税込・税抜の不一致 ${basisConflictItemCount}件`
            : unresolvedTaxItemCount > 0
              ? `税率未確定 ${unresolvedTaxItemCount}件`
              : `確認推奨 ${recommendationCount}件`
        }
      />
    </Stack>
  );
}
