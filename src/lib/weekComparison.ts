import { formatSignedPercent, formatSignedYen } from "../../lib/domain/common/currency";

export {
  calcPrevWeekDiff,
  calcPrevWeekRate,
  calcPrevWeekRatio,
} from "../../lib/domain/week/comparison";

export function formatPrevWeekDiff(diff: number | null): string {
  if (diff === null) {
    return "比較データなし";
  }
  return formatSignedYen(diff);
}

export function formatPrevWeekRate(rate: number | null): string {
  if (rate === null) {
    return "前週データなし";
  }
  return formatSignedPercent(rate);
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
