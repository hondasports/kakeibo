/**
 * users endpoint の純粋なドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */
import { normalizeEmail } from "./email";
import { resolveDisplayName } from "./displayName";

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

/** 内部 upsert（Clerk webhook 等）の displayName 解決。 */
export function resolveProfileDisplayName(displayName: string, email?: string): string {
  return displayName.trim() || email || "ユーザー";
}

/** ユーザーの存在を検証して返す。 */
export function assertUserFound<T>(user: T | null): T {
  if (user === null) {
    throw new Error("User not found");
  }
  return user;
}
