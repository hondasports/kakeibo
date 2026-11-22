/**
 * users endpoint の純粋なドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */
import { normalizeEmail } from "./email";
import { resolveDisplayName } from "./displayName";

/**
 * endpoint 契約上期待されるドメインエラー。
 * presentation 層はこの型のみ ConvexError へ変換し、
 * 予期しないエラー（DB・adapter 由来）はそのまま再送出する。
 */
export class UserDomainError extends Error {}

/** identity 由来の upsert 入力。Clerk 型に依存しない。 */
export type UserIdentityInput = {
  userId: string;
  name?: string;
  email?: string;
};

type ExistingUserLike = {
  displayName: string;
  email?: string;
};

/** 新規 insert 用のフィールドを構築する。 */
export function buildUserInsertFields(
  identity: UserIdentityInput,
  now: number,
): {
  userId: string;
  displayName: string;
  email?: string;
  createdAt: number;
  updatedAt: number;
} {
  return {
    userId: identity.userId,
    displayName: resolveDisplayName({ name: identity.name, email: identity.email }),
    email: normalizeEmail(identity.email),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 既存ユーザーへの upsert patch を構築する。
 * displayName は identity 優先・未解決なら既存値を維持し、
 * email は identity 側が無ければ既存値を維持する。
 */
export function buildUserUpsertPatch(
  identity: UserIdentityInput,
  existing: ExistingUserLike,
  now: number,
): { displayName: string; email?: string; updatedAt: number } {
  return {
    displayName: resolveDisplayName({
      name: identity.name,
      email: identity.email,
      existingDisplayName: existing.displayName,
    }),
    email: normalizeEmail(identity.email) ?? existing.email,
    updatedAt: now,
  };
}

/** 月収入の上限（円）。入力契約の正本。 */
export const MAX_MONTHLY_INCOME_YEN = 999_999_999;

/**
 * 月収入の数値検証。未設定（undefined）は許容し、設定する場合は
 * 0以上 MAX_MONTHLY_INCOME_YEN 以下の整数のみを認める。
 */
export function validateMonthlyIncome(
  income: number | undefined,
): { success: true } | { success: false } {
  if (income === undefined) {
    return { success: true };
  }
  if (!Number.isInteger(income) || income < 0 || income > MAX_MONTHLY_INCOME_YEN) {
    return { success: false };
  }
  return { success: true };
}

/** 内部 upsert（Clerk webhook 等）の displayName 解決。 */
export function resolveProfileDisplayName(displayName: string, email?: string): string {
  return displayName.trim() || email || "ユーザー";
}

/** ユーザーの存在を検証して返す。 */
export function assertUserFound<T>(user: T | null): T {
  if (user === null) {
    throw new UserDomainError("User not found");
  }
  return user;
}
