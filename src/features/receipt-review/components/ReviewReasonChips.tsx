import { Chip, Stack } from "@mui/material";
import type { AiExpenseQueueStatus } from "../../ai-expense-queue/types/types";
import { getReviewReasonLabel } from "./labels";

export function ReviewReasonChips({
  reasons,
  status,
}: {
  reasons: string[];
  status: AiExpenseQueueStatus;
}) {
  if (reasons.length === 0) {
    return null;
  }

  const color = status === "failed" ? "error" : "warning";

  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
      {reasons.map((reason, index) => (
        <Chip
          color={color}
          key={`${reason}-${index}`}
          label={getReviewReasonLabel(reason)}
          size="small"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}
