/**
 * Convex paginate の汎用型（domain interface 共通）。
 * ドメイン側はカーソルを不透明に扱う。
 */
export type PaginatedResult<T> = {
  page: T[];
  continueCursor: string;
  isDone: boolean;
};

export type PaginationOpts = { numItems: number; cursor: string | null };
