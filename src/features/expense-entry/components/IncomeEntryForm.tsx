import { Alert, Box, Button, Snackbar, Stack, TextField } from "@mui/material";
import { currencyFormatter } from "../../../../lib/domain/common/currency";
import { extractAmountDigits } from "../../../utils/currency";
import type { useIncomeEntry } from "../hooks/useIncomeEntry";
import { ExpenseFormHeading } from "./ExpenseFormHeading";
import { WeekDaySelector } from "./WeekDaySelector";

type IncomeEntryFormProps = {
  weekStartDate: string;
  weekEndDate: string;
  date: string;
  setDate: (date: string) => void;
} & ReturnType<typeof useIncomeEntry>;

export function IncomeEntryForm({
  weekStartDate,
  weekEndDate,
  date,
  setDate,
  incomeAmount,
  setIncomeAmount,
  incomeTitle,
  setIncomeTitle,
  incomeAmountError,
  setIncomeAmountError,
  incomeTitleError,
  setIncomeTitleError,
  incomeError,
  incomeSaved,
  setIncomeSaved,
  incomeSubmitting,
  handleSubmit,
}: IncomeEntryFormProps) {
  return (
    <Box className="input-workbench input-workbench--income">
      <form noValidate onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          <ExpenseFormHeading isMultiMode={false} />

          {incomeError ? (
            <Alert severity="error" variant="outlined">
              {incomeError}
            </Alert>
          ) : null}

          <WeekDaySelector
            selectedDate={date}
            weekEndDate={weekEndDate}
            weekStartDate={weekStartDate}
            onSelectDate={setDate}
          />

          <TextField
            autoComplete="off"
            error={Boolean(incomeAmountError)}
            fullWidth
            helperText={incomeAmountError}
            label="金額"
            name="incomeAmountYen"
            onChange={(event) => {
              setIncomeAmount(extractAmountDigits(event.target.value));
              setIncomeAmountError("");
            }}
            placeholder="例: 320,000…"
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            value={incomeAmount ? currencyFormatter.format(Number(incomeAmount)) : ""}
          />

          <TextField
            autoComplete="off"
            error={Boolean(incomeTitleError)}
            fullWidth
            helperText={incomeTitleError || "給与、賞与、立替精算など"}
            label="収入の内容・メモ"
            minRows={2}
            multiline
            name="incomeDescription"
            onChange={(event) => {
              setIncomeTitle(event.target.value);
              setIncomeTitleError("");
            }}
            placeholder="例: 給与、賞与、立替精算など…"
            value={incomeTitle}
          />

          <Button
            aria-busy={incomeSubmitting}
            disabled={incomeSubmitting}
            size="large"
            sx={{ minHeight: 44 }}
            type="submit"
            variant="contained"
          >
            {incomeSubmitting ? "保存中…" : "保存して次へ"}
          </Button>
        </Stack>
      </form>

      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={3000}
        onClose={() => setIncomeSaved(false)}
        open={incomeSaved}
      >
        <Alert onClose={() => setIncomeSaved(false)} severity="success" variant="filled">
          収入を保存しました
        </Alert>
      </Snackbar>
    </Box>
  );
}
