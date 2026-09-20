import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  TaxMode,
  TaxRatePercent,
} from "../../../../../lib/receiptTax/types";
import { AmountBasisSelect } from "./AmountBasisSelect";
import { TaxRateSelect } from "./TaxRateSelect";
import {
  formatYenLabel,
  getTaxSummaryConflictLabel,
  getTaxSummaryStatusLabel,
} from "../../utils/receiptTaxLabels";

export type TaxSummaryChange = {
  taxRatePercent?: TaxRatePercent;
  taxMode?: TaxMode;
  taxableAmountYen?: number;
  taxableAmountBasis?: AmountBasis;
  taxYen?: number;
  taxIncludedAmountYen?: number;
};

type EditableTaxSummary = Omit<ExtractedTaxSummary, "confidence">;

export function ReceiptTaxSummaryEditor({
  summary,
  summaryIndex,
  isSaving,
  onChange,
}: {
  summary: EditableTaxSummary;
  summaryIndex: number;
  isSaving: boolean;
  onChange: (index: number, change: TaxSummaryChange) => void;
}) {
  const [form, setForm] = useState<TaxSummaryChange>({
    taxRatePercent: summary.taxRatePercent,
    taxMode: summary.taxMode,
    taxableAmountYen: summary.taxableAmountYen,
    taxableAmountBasis: summary.taxableAmountBasis,
    taxYen: summary.taxYen,
    taxIncludedAmountYen: summary.taxIncludedAmountYen,
  });

  const [prevSummary, setPrevSummary] = useState(summary);
  if (prevSummary !== summary) {
    setPrevSummary(summary);
    setForm({
      taxRatePercent: summary.taxRatePercent,
      taxMode: summary.taxMode,
      taxableAmountYen: summary.taxableAmountYen,
      taxableAmountBasis: summary.taxableAmountBasis,
      taxYen: summary.taxYen,
      taxIncludedAmountYen: summary.taxIncludedAmountYen,
    });
  }

  const handleChange = (next: Partial<TaxSummaryChange>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  const handleSave = () => {
    const change: TaxSummaryChange = {};
    if (form.taxRatePercent !== undefined && form.taxRatePercent !== summary.taxRatePercent) {
      change.taxRatePercent = form.taxRatePercent;
    }
    if (form.taxMode !== undefined && form.taxMode !== summary.taxMode) {
      change.taxMode = form.taxMode;
    }
    if (form.taxableAmountYen !== undefined && form.taxableAmountYen !== summary.taxableAmountYen) {
      change.taxableAmountYen = form.taxableAmountYen;
    }
    if (
      form.taxableAmountBasis !== undefined &&
      form.taxableAmountBasis !== summary.taxableAmountBasis
    ) {
      change.taxableAmountBasis = form.taxableAmountBasis;
    }
    if (form.taxYen !== undefined && form.taxYen !== summary.taxYen) {
      change.taxYen = form.taxYen;
    }
    if (
      form.taxIncludedAmountYen !== undefined &&
      form.taxIncludedAmountYen !== summary.taxIncludedAmountYen
    ) {
      change.taxIncludedAmountYen = form.taxIncludedAmountYen;
    }

    if (Object.keys(change).length > 0) {
      onChange(summaryIndex, change);
    }
  };

  const amountBasisLabel = getAmountBasisLabel(form.taxableAmountBasis);

  const status = summary.status ?? "ambiguous";
  const statusLabel = getTaxSummaryStatusLabel(status);

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2">
          {summary.taxRatePercent}% {getTaxModeLabel(summary.taxMode)}
        </Typography>
        <Typography color="warning.main" variant="caption">
          {statusLabel}
        </Typography>
      </Stack>

      {summary.reasons && summary.reasons.length > 0 && (
        <Typography color="warning.main" variant="body2">
          {summary.reasons.map(getTaxSummaryConflictLabel).join(" / ")}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <TaxRateSelect
          disabled={isSaving}
          label="税率"
          value={form.taxRatePercent}
          onChange={(value) => handleChange({ taxRatePercent: value ?? undefined })}
        />
        <TextField
          aria-label="税モード"
          disabled={isSaving}
          label="税モード"
          onChange={(event) => handleChange({ taxMode: event.target.value as TaxMode })}
          select
          size="small"
          value={form.taxMode ?? "unknown"}
        >
          <MenuItem value="external">外税</MenuItem>
          <MenuItem value="included">内税</MenuItem>
          <MenuItem value="mixed">混在</MenuItem>
          <MenuItem value="unknown">不明</MenuItem>
        </TextField>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <TextField
          aria-label="対象額"
          disabled={isSaving}
          label="対象額"
          onChange={(event) => {
            const value = Number(event.target.value);
            handleChange({
              taxableAmountYen: Number.isFinite(value) && value >= 0 ? value : undefined,
            });
          }}
          size="small"
          type="number"
          value={form.taxableAmountYen ?? ""}
        />
        <AmountBasisSelect
          disabled={isSaving}
          label="対象額種別"
          value={form.taxableAmountBasis}
          onChange={(value) => handleChange({ taxableAmountBasis: value })}
        />
      </Stack>

      <Typography color="text.secondary" variant="body2">
        対象額 {formatYenLabel(form.taxableAmountYen)}
        {amountBasisLabel}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <TextField
          aria-label="税額"
          disabled={isSaving}
          label="税額"
          onChange={(event) => {
            const value = Number(event.target.value);
            handleChange({ taxYen: Number.isFinite(value) && value >= 0 ? value : undefined });
          }}
          size="small"
          type="number"
          value={form.taxYen ?? ""}
        />
        <TextField
          aria-label="税込合計"
          disabled={isSaving}
          label="税込合計"
          onChange={(event) => {
            const value = Number(event.target.value);
            handleChange({
              taxIncludedAmountYen: Number.isFinite(value) && value >= 0 ? value : undefined,
            });
          }}
          size="small"
          type="number"
          value={form.taxIncludedAmountYen ?? ""}
        />
      </Stack>

      <Button
        disabled={isSaving}
        onClick={handleSave}
        size="small"
        type="button"
        variant="outlined"
      >
        {isSaving ? "保存中…" : "保存"}
      </Button>
    </Stack>
  );
}

function getAmountBasisLabel(amountBasis: AmountBasis | undefined): string {
  if (amountBasis === "tax_included") return "（税込）";
  if (amountBasis === "tax_excluded") return "（税抜）";
  return "（種別不明）";
}

function getTaxModeLabel(taxMode: TaxMode): string {
  switch (taxMode) {
    case "external":
      return "外税";
    case "included":
      return "内税";
    case "mixed":
      return "混在";
    default:
      return "不明";
  }
}
