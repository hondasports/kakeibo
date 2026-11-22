import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, Button, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { formatYen } from "../../../../lib/domain/common/currency";
import { monthlyBudgetProgress } from "../../../../lib/domain/groups/monthlyBudget";

export function DashboardMonthlySummaryLink({ month }: { month: string }) {
  const myGroup = useQuery(api.groups.queries.getMyGroup);
  const monthSummary = useQuery(api.receipts.summaries.getMonthSummaryWithCategories, { month });
  const budgetYen = myGroup?.monthlyBudgetYen;
  const spentYen = monthSummary?.totalAmountYen;
  const progress =
    budgetYen != null && spentYen !== undefined ? monthlyBudgetProgress(budgetYen, spentYen) : null;

  return (
    <Box>
      <Button
        component={Link}
        endIcon={<ChevronRightIcon />}
        fullWidth
        sx={{ minHeight: 44 }}
        to={`/months/${month}`}
        variant="outlined"
      >
        今月の月次サマリーを見る
      </Button>
      {progress !== null && (
        <Typography
          aria-label="月予算の状況"
          color={progress.remainingYen < 0 ? "error.main" : "text.secondary"}
          sx={{ mt: 0.5, textAlign: "center" }}
          variant="caption"
        >
          {progress.remainingYen < 0
            ? `月予算を ${formatYen(-progress.remainingYen)} 超過しています`
            : `月予算の残りは ${formatYen(progress.remainingYen)} です（${progress.usedPercent}% 使用）`}
        </Typography>
      )}
    </Box>
  );
}
