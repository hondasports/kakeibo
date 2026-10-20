import { currencyFormatter } from "../../lib/domain/common/currency";

export {
  calcPrevWeekDiff,
  calcPrevWeekRate,
  calcPrevWeekRatio,
} from "../../lib/domain/week/comparison";

export function formatPrevWeekDiff(diff: number | null): string {
  if (diff === null) {
    return "比較データなし";
  }
  if (diff === 0) {
    return "±0円";
  }
  const sign = diff > 0 ? "+" : "";
  return `${sign}${currencyFormatter.format(diff)}円`;
}

export function formatPrevWeekRate(rate: number | null): string {
  if (rate === null) {
    return "前週データなし";
  }
  if (rate === 0) {
    return "±0%";
  }
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate}%`;
}

export function formatPrevWeekRatioWithArrow(ratio: number | null): string {
  if (ratio === null) {
    return "前週データなし";
  }
  if (ratio === 100) {
    return "100%";
  }
  const arrow = ratio > 100 ? " ↑" : " ↓";
  return `${ratio}%${arrow}`;
}
