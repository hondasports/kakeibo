import { formatYen, formatYenAbs } from "../../../../lib/domain/common/currency";

export function formatSignedYen(value: number): string {
  if (value === 0) {
    return formatYen(0);
  }
  return `${value < 0 ? "−" : "+"}${formatYenAbs(value)}`;
}

export function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === 0) {
    return "0%";
  }
  return `${value < 0 ? "−" : "+"}${Math.abs(value)}%`;
}
