import { formatSignedPercent as formatSignedPercentValue } from "../../../../lib/domain/common/currency";

export function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return formatSignedPercentValue(value);
}
