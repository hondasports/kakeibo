import { resolveAmountBasisFromSummary } from "../receipt/tax/reinterpretDraftTax";
import type { AmountBasis, ExtractedTaxSummary, ResolvedAmountBasis } from "../receipt/tax/types";

type DeriveBulkTaxSettingsError = "unknown_tax_mode" | "cannot_derive_amount_basis";

type DeriveBulkTaxSettingsArgs = {
  summary: ExtractedTaxSummary;
  taxRatePercent?: number;
  amountBasis?: AmountBasis;
};

function isResolvedAmountBasis(value: AmountBasis | null): value is ResolvedAmountBasis {
  return value === "tax_included" || value === "tax_excluded";
}

export function deriveBulkTaxSettings(
  args: DeriveBulkTaxSettingsArgs,
):
  | { success: true; taxRatePercent: number; amountBasis: ResolvedAmountBasis }
  | { success: false; error: DeriveBulkTaxSettingsError } {
  if (args.summary.taxMode === "unknown" || args.summary.taxMode === "mixed") {
    return { success: false, error: "unknown_tax_mode" };
  }

  const resolvedAmountBasis = args.amountBasis ?? resolveAmountBasisFromSummary(args.summary);
  if (!isResolvedAmountBasis(resolvedAmountBasis)) {
    return { success: false, error: "cannot_derive_amount_basis" };
  }

  const resolvedTaxRatePercent = args.taxRatePercent ?? args.summary.taxRatePercent;
  return {
    success: true,
    taxRatePercent: resolvedTaxRatePercent,
    amountBasis: resolvedAmountBasis,
  };
}

const bulkTaxSettingsErrorMessages: Record<DeriveBulkTaxSettingsError, string> = {
  unknown_tax_mode: "Bulk tax settings require a definitive tax mode",
  cannot_derive_amount_basis: "Could not derive amount basis from tax summary",
};

/** deriveBulkTaxSettings のエラー理由をユーザー向けメッセージに変換する */
export function getBulkTaxSettingsErrorMessage(error: DeriveBulkTaxSettingsError): string {
  return bulkTaxSettingsErrorMessages[error];
}
