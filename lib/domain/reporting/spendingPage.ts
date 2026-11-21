import type { PaginatedResult, PaginationOpts } from "../pagination";

export function getSpendingPage<T>(
  rows: readonly T[],
  { numItems, cursor }: PaginationOpts,
): PaginatedResult<T> {
  const offset = cursor === null ? 0 : Number(cursor);
  const nextOffset = Math.min(rows.length, offset + numItems);
  const page = rows.slice(offset, nextOffset);

  return {
    page,
    continueCursor: String(nextOffset + 1),
    isDone: nextOffset >= rows.length,
  };
}
