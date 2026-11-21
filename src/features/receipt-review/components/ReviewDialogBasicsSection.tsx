import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { ReviewFormValues } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import { REVIEW_VALIDATION_MESSAGES } from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";
import {
  EXPENSE_ENTRY_AMOUNT_MAX,
  parseExpenseAmountString,
} from "../../../../lib/domain/expenseEntries/expenseEntryItem";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { documentTypeLabels, reviewDocumentTypeOptions } from "./labels";
import { extractAmountDigits } from "../../../utils/currency";

type ReviewDialogBasicsSectionProps = {
  form: ReviewFormValues;
  categories: AiExpenseQueueCategory[];
  documentOpen: boolean;
  busy: boolean;
  register: (target: string) => (node: HTMLElement | null) => void;
  onToggleDocument: () => void;
  onFieldChange: (field: keyof ReviewFormValues, value: string) => void;
};

export function ReviewDialogBasicsSection({
  form,
  categories,
  documentOpen,
  busy,
  register,
  onToggleDocument,
  onFieldChange,
}: ReviewDialogBasicsSectionProps) {
  const amountResult = parseExpenseAmountString(form.amountYen);
  const amountErrorMessage = amountResult.success
    ? undefined
    : amountResult.error === "too_large"
      ? `合計金額は ${EXPENSE_ENTRY_AMOUNT_MAX.toLocaleString("ja-JP")} 円以下で入力してください。`
      : REVIEW_VALIDATION_MESSAGES.amount.guidance;
  return (
    <Box
      component="fieldset"
      disabled={busy}
      inert={busy}
      sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
    >
      <Box
        component="section"
        ref={register("basics")}
        tabIndex={-1}
        aria-label="レシートの基本情報"
        sx={{ scrollMarginTop: 16 }}
      >
        <TextField
          ref={register("shopName")}
          variant="standard"
          label="店名・内容"
          fullWidth
          value={form.shopName}
          error={!form.shopName.trim()}
          helperText={
            !form.shopName.trim() ? REVIEW_VALIDATION_MESSAGES.shopName.guidance : undefined
          }
          sx={(theme) => ({
            "& .MuiInputBase-input": theme.typography.h5,
          })}
          slotProps={{
            inputLabel: { shrink: true },
          }}
          onChange={(event) => onFieldChange("shopName", event.target.value)}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField
            ref={register("date")}
            variant="standard"
            label="支出日（レシート記載日）"
            type="date"
            fullWidth
            value={form.date}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => onFieldChange("date", event.target.value)}
          />
          <TextField
            ref={register("amountYen")}
            variant="standard"
            label="合計金額"
            fullWidth
            value={form.amountYen}
            error={!amountResult.success}
            helperText={amountErrorMessage}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) =>
              onFieldChange("amountYen", extractAmountDigits(event.target.value))
            }
          />
          <TextField
            ref={register("categoryId")}
            variant="standard"
            label="レシート全体のカテゴリ"
            select
            fullWidth
            value={form.categoryId}
            error={!form.categoryId}
            helperText={!form.categoryId ? REVIEW_VALIDATION_MESSAGES.category.guidance : undefined}
            onChange={(event) => onFieldChange("categoryId", event.target.value)}
          >
            {categories.map((category) => (
              <MenuItem key={category._id} value={category._id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Box component="details" ref={register("document")} open={documentOpen} sx={{ mt: 1 }}>
          <Typography
            component="summary"
            variant="body2"
            color="text.secondary"
            onClick={(event) => {
              event.preventDefault();
              onToggleDocument();
            }}
            sx={{ cursor: "pointer" }}
          >
            書類種別：{documentTypeLabels[form.documentType]}
          </Typography>
          <TextField
            label="書類種別"
            error={form.documentType === "unknown"}
            helperText={
              form.documentType === "unknown"
                ? REVIEW_VALIDATION_MESSAGES.document.guidance
                : undefined
            }
            select
            fullWidth
            value={form.documentType === "unknown" ? "" : form.documentType}
            sx={{ mt: 1 }}
            onChange={(event) => onFieldChange("documentType", event.target.value)}
          >
            <MenuItem value="" disabled>
              書類種別を選択
            </MenuItem>
            {reviewDocumentTypeOptions.map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Box>
    </Box>
  );
}
