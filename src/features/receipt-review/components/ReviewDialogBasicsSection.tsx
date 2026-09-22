import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { ReviewFormValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { documentTypeLabels, reviewDocumentTypeOptions } from "./labels";

export type ReviewDialogBasicsSectionProps = {
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
          slotProps={{
            htmlInput: { style: { fontSize: "1.25rem", fontWeight: 600 } },
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
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) =>
              onFieldChange("amountYen", event.target.value.replace(/[^\d]/g, ""))
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
