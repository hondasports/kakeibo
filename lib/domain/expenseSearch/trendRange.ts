export const MAX_HISTORY_TREND_BUCKETS = 1200;

export function getHistoryTrendRangeError(
  startDate: string | undefined,
  endDate: string | undefined,
): string | null {
  if (startDate === undefined || endDate === undefined) {
    return null;
  }

  const monthCount =
    (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
    Number(endDate.slice(5, 7)) -
    Number(startDate.slice(5, 7)) +
    1;
  // 日次は31個、週次は27個以下。年次への粗粒度化は月別表示の契約を変えるため行わない。
  return monthCount > MAX_HISTORY_TREND_BUCKETS
    ? `期間は${MAX_HISTORY_TREND_BUCKETS}か月以内で指定してください`
    : null;
}
