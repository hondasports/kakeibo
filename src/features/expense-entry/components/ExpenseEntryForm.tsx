import type { Id } from "../../../../convex/_generated/dataModel";
import type { EntryKind } from "../../../../lib/domain/common/entryKind";
import { useState } from "react";
import { Box, Paper, Stack, Tab, Tabs } from "@mui/material";
import { useExpenseEntryForm } from "../hooks/useExpenseEntryForm";
import { useIncomeEntry } from "../hooks/useIncomeEntry";
import { ExpenseEntryWorkbench } from "./ExpenseEntryWorkbench";
import { IncomeEntryForm } from "./IncomeEntryForm";

interface ExpenseEntryFormProps {
  weekStartDate: string;
  weekEndDate: string;
  categories: Array<{ _id: Id<"categories">; name: string; color: string }>;
}

export function ExpenseEntryForm({
  weekStartDate,
  weekEndDate,
  categories,
}: ExpenseEntryFormProps) {
  const [entryType, setEntryType] = useState<EntryKind>("expense");
  const expense = useExpenseEntryForm({ weekStartDate, weekEndDate, categories });
  const income = useIncomeEntry(expense.date);

  return (
    <Paper className="paper-panel" elevation={0} sx={{ maxWidth: "100%", minWidth: 0 }}>
      <Box sx={{ maxWidth: "100%", minWidth: 0, p: 2.5 }}>
        <Stack spacing={2.5}>
          <Tabs
            aria-label="支出・収入切り替え"
            value={entryType}
            variant="fullWidth"
            onChange={(_event, value: EntryKind) => setEntryType(value)}
          >
            <Tab label="支出" value="expense" />
            <Tab label="収入" value="income" />
          </Tabs>

          {entryType === "expense" ? (
            <ExpenseEntryWorkbench
              categories={categories}
              weekEndDate={weekEndDate}
              weekStartDate={weekStartDate}
              {...expense}
            />
          ) : (
            <IncomeEntryForm
              date={expense.date}
              setDate={expense.setDate}
              weekEndDate={weekEndDate}
              weekStartDate={weekStartDate}
              {...income}
            />
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
