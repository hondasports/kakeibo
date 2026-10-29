import { api } from "../../../../convex/_generated/api";
import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import {
  getExpenseItemFieldErrorMessage,
  parseExpenseAmountString,
  validateExpenseTitle,
} from "../../../../lib/domain/expenseEntries/expenseEntryItem";

export function useIncomeEntry(date: string) {
  const createIncomeEntry = useMutation(api.expenseEntries.mutations.createIncomeEntry);

  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeTitle, setIncomeTitle] = useState("");
  const [incomeAmountError, setIncomeAmountError] = useState("");
  const [incomeTitleError, setIncomeTitleError] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [incomeSaved, setIncomeSaved] = useState(false);
  const [incomeSubmitting, setIncomeSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const amountResult = parseExpenseAmountString(incomeAmount);
      const titleResult = validateExpenseTitle(incomeTitle);
      setIncomeAmountError(
        amountResult.success
          ? ""
          : getExpenseItemFieldErrorMessage("amountYen", amountResult.error),
      );
      setIncomeTitleError(
        titleResult.success ? "" : getExpenseItemFieldErrorMessage("title", titleResult.error),
      );

      if (!amountResult.success || !titleResult.success) {
        return;
      }

      setIncomeSubmitting(true);
      setIncomeError("");
      try {
        await createIncomeEntry({
          date,
          amountYen: amountResult.amountYen,
          title: titleResult.title,
        });
        setIncomeAmount("");
        setIncomeTitle("");
        setIncomeSaved(true);
      } catch (error) {
        setIncomeError(
          error instanceof Error ? error.message : "保存に失敗しました。もう一度お試しください。",
        );
      } finally {
        setIncomeSubmitting(false);
      }
    },
    [createIncomeEntry, date, incomeAmount, incomeTitle],
  );

  return {
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
  };
}
