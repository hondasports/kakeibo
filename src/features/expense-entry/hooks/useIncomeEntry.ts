import { api } from "../../../../convex/_generated/api";
import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
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

      const normalizedIncomeAmount = incomeAmount.replace(/[^\d]/g, "");
      const amountYen = Number(normalizedIncomeAmount);

      const amountError =
        !Number.isInteger(amountYen) || amountYen <= 0 ? "1円以上の金額を入力してください" : "";
      const titleError = incomeTitle.trim() ? "" : "収入の内容を入力してください";

      setIncomeAmountError(amountError);
      setIncomeTitleError(titleError);

      if (amountError || titleError) {
        return;
      }

      setIncomeSubmitting(true);
      setIncomeError("");
      try {
        await createIncomeEntry({ date, amountYen, title: incomeTitle.trim() });
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
