import {
  getTaxWarningMessage,
  isDialogHiddenTaxWarning,
} from "../../../../lib/domain/receipt/tax/warnings";

export function formatTaxWarning(warning: string) {
  return getTaxWarningMessage(warning);
}

export function formatTaxWarnings(warnings: string[]) {
  const counts = new Map<string, number>();
  warnings.forEach((warning) => {
    const label = formatTaxWarning(warning);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${label}（${count}件）` : label))
    .join(" / ");
}

export { isDialogHiddenTaxWarning } from "../../../../lib/domain/receipt/tax/warnings";

export function formatTaxWarningsForDialog(warnings: string[]) {
  return formatTaxWarnings(warnings.filter((warning) => !isDialogHiddenTaxWarning(warning)));
}
