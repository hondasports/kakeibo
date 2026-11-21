import { Box, Paper, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import { formatDateForDisplay } from "../../../utils/date";

type WeekStatusPanelProps = {
  count: number;
  totalAmountYen: number;
  weekStartDate: string;
  isCurrentWeek: boolean;
};

export function WeekStatusPanel({
  count,
  totalAmountYen,
  weekStartDate,
  isCurrentWeek,
}: WeekStatusPanelProps) {
  const heading = isCurrentWeek ? "今週の進捗" : `${formatDateForDisplay(weekStartDate)}週の進捗`;

  return (
    <Paper className="paper-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography component="h2" variant="h6">
            {heading}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {count}件・合計 {formatYen(totalAmountYen)}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}
