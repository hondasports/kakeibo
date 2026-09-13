/**
 * systemAdmin 検索の純粋ドメイン関数。
 * クエリ正規化・ページ件数検証・SHA-256 ハッシュ・監査 queryType 写像。
 */

export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SEARCH_PAGE_SIZE = 100;
export const DETAIL_LIST_LIMIT = 50;

export type UserSearchType = "displayName" | "email" | "userId";
export type GroupSearchType = "name" | "groupId";
export type SearchAuditQueryType =
  | "user_display_name"
  | "user_email"
  | "user_id"
  | "group_name"
  | "group_id";

/** ページ件数が 1〜MAX_SEARCH_PAGE_SIZE の整数か判定する。 */
export function isValidSearchPageSize(numItems: number): boolean {
  return Number.isInteger(numItems) && numItems >= 1 && numItems <= MAX_SEARCH_PAGE_SIZE;
}

/** 検索語を trim し、上限超過かどうかを返す。 */
export function normalizeSearchQuery(query: string): { value: string; tooLong: boolean } {
  const normalized = query.trim();
  return { value: normalized, tooLong: normalized.length > MAX_SEARCH_QUERY_LENGTH };
}

/** 検索語を trim+lowercase して SHA-256 hex へハッシュする（監査用・PII 非保存）。 */
export async function hashSearchQuery(query: string): Promise<string> {
  const normalized = query.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function userAuditQueryType(queryType: UserSearchType): SearchAuditQueryType {
  if (queryType === "displayName") return "user_display_name";
  if (queryType === "email") return "user_email";
  return "user_id";
}

export function groupAuditQueryType(queryType: GroupSearchType): SearchAuditQueryType {
  return queryType === "name" ? "group_name" : "group_id";
}

export type SystemAdminEnvironment = "development" | "preview" | "production";

/** APP_ENV を systemAdmin 検索の environment 表示値へ解決する。未設定は development。 */
export function resolveSystemAdminSearchEnvironment(
  env: string | undefined,
): { success: true; environment: SystemAdminEnvironment } | { success: false } {
  if (env === undefined || env === "development") {
    return { success: true, environment: "development" };
  }
  if (env === "preview" || env === "production") {
    return { success: true, environment: env };
  }
  return { success: false };
}
