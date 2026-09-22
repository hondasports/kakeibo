import { api } from "../../../../convex/_generated/api";
import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { validateReceiptForm, type ReceiptFormErrors } from "../validation/receipt";
import type { ExtractedReceiptResult } from "../hooks/useReceiptImageExtraction";
import type { NormalizedReceiptExtraction } from "../validation/receiptExtraction";

type ExpenseFormValues = {
  type: "expense";
  date: string;
  shopName: string;
  amountYen: string;
  categoryId: Id<"categories"> | "";
  memo: string;
};

type IncomeFormValues = {
  type: "income";
  date: string;
  bankName: string;
  amountYen: string;
  categoryId: Id<"categories"> | "";
  memo: string;
};

type ReceiptFormValues = ExpenseFormValues | IncomeFormValues;

type UseReceiptFormArgs = {
  weekStartDate: string;
  weekEndDate: string;
  categories: Array<{ _id: Id<"categories">; name: string; color: string }>;
};

export function useReceiptForm({ weekStartDate, weekEndDate, categories }: UseReceiptFormArgs) {
  const shopNameRef = useRef<HTMLInputElement>(null);
  const bankNameRef = useRef<HTMLInputElement>(null);

  const [formValues, setFormValues] = useState<ReceiptFormValues>({
    type: "expense",
    date: weekStartDate,
    shopName: "",
    amountYen: "",
    categoryId: categories[0]?._id ?? "",
    memo: "",
  });
  const [errors, setErrors] = useState<ReceiptFormErrors>({});
  const [aiFieldStatuses, setAiFieldStatuses] = useState<
    NormalizedReceiptExtraction["fieldStatuses"] | null
  >(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [apiError, setApiError] = useState("");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    severity: "success" | "error";
    message: string;
  }>({ open: false, severity: "success", message: "" });

  const createReceipt = useMutation(api.receipts.crud.createReceipt);

  const firstCategoryId = categories[0]?._id ?? "";
  const selectedCategoryId =
    formValues.categoryId !== "" &&
    categories.some((category) => category._id === formValues.categoryId)
      ? formValues.categoryId
      : firstCategoryId;

  const handleTypeChange = (newType: "expense" | "income") => {
    const base = {
      date: formValues.date,
      amountYen: formValues.amountYen,
      categoryId: formValues.categoryId,
      memo: formValues.memo,
    };
    if (newType === "income") {
      setFormValues({ type: "income", bankName: "", ...base });
    } else {
      setFormValues({ type: "expense", shopName: "", ...base });
    }
    setErrors({});
    setAiFieldStatuses(null);
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    // フィールド変更時にそのフィールドのエラーをクリア
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // フィールド手動編集時に AI候補 状態をクリア
    if (aiFieldStatuses && field in aiFieldStatuses) {
      setAiFieldStatuses((prev) =>
        prev
          ? {
              ...prev,
              [field]: {
                ...prev[field as keyof typeof prev],
                status: "rejected",
              },
            }
          : null,
      );
    }
  };

  const handleExtracted = ({ fields, fieldStatuses }: ExtractedReceiptResult) => {
    const extractedDateIsOutsideWeek =
      fields.date && (fields.date < weekStartDate || fields.date > weekEndDate);

    if (extractedDateIsOutsideWeek) {
      setErrors((prev) => ({
        ...prev,
        date: "読み取った日付はこの週の範囲外です。確認して手入力してください。",
      }));
      return;
    }

    setFormValues((prev) => ({
      ...prev,
      ...(prev.type === "expense" && fields.shopName ? { shopName: fields.shopName } : {}),
      // weekStartDate〜weekEndDate 範囲内であれば日付を反映、範囲外は無視
      date: fields.date ? fields.date : prev.date,
      // amountYen は文字列として保持（カンマ区切り表示のため）
      amountYen:
        fields.amountYen && fields.amountYen > 0 ? String(fields.amountYen) : prev.amountYen,
    }));
    // 反映されたフィールドのバリデーションエラーをクリア
    setErrors((prev) => ({
      ...prev,
      ...(fields.shopName ? { shopName: undefined } : {}),
      ...(fields.amountYen ? { amountYen: undefined } : {}),
      ...(fields.date ? { date: undefined } : {}),
    }));
    // AI候補フィールドのステータスを保存（applied フィールドのみハイライト対象）
    setAiFieldStatuses(fieldStatuses);
  };

  const submitForm = async () => {
    const validation = validateReceiptForm({
      ...formValues,
      categoryId: selectedCategoryId,
    });
    if (!validation.success) {
      setErrors(validation.errors);
      return;
    }
    setStatus("submitting");
    setApiError("");
    try {
      if (validation.data.type === "income") {
        await createReceipt({
          type: "income",
          date: validation.data.date,
          bankName: validation.data.bankName,
          amountYen: validation.data.amountYen,
          categoryId: validation.data.categoryId as Id<"categories">,
          memo: validation.data.memo,
        });
      } else {
        await createReceipt({
          type: "expense",
          date: validation.data.date,
          shopName: validation.data.shopName,
          amountYen: validation.data.amountYen,
          categoryId: validation.data.categoryId as Id<"categories">,
          memo: validation.data.memo,
        });
      }
      // 保存成功 → 名前系・金額・メモをクリア、日付・カテゴリを引き継ぐ
      if (formValues.type === "income") {
        setFormValues((prev) => ({ ...prev, bankName: "", amountYen: "", memo: "" }));
        bankNameRef.current?.focus();
      } else {
        setFormValues((prev) => ({ ...prev, shopName: "", amountYen: "", memo: "" }));
        shopNameRef.current?.focus();
      }
      setErrors({});
      setAiFieldStatuses(null);
      setStatus("idle");
      setSnackbar({ open: true, severity: "success", message: "レシートを保存しました" });
    } catch (err) {
      setStatus("error");
      const message =
        err instanceof Error ? err.message : "保存に失敗しました。もう一度お試しください。";
      setApiError(message);
      setSnackbar({ open: true, severity: "error", message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm();
  };

  const handleRetry = async () => {
    await submitForm();
  };

  const handleSnackbarClose = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return {
    shopNameRef,
    bankNameRef,
    formValues,
    errors,
    aiFieldStatuses,
    status,
    apiError,
    snackbar,
    selectedCategoryId,
    handleTypeChange,
    handleFieldChange,
    handleExtracted,
    handleSubmit,
    handleRetry,
    handleSnackbarClose,
  };
}
