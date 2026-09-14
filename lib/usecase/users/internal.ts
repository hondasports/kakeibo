/**
 * internal users endpoint のユースケース。
 * internalMutation/internalQuery からのみ呼ばれ、認証は行わない。
 */
import { resolveProfileDisplayName } from "../../domain/users/rules";
import { normalizeEmail } from "../../domain/users/email";
import type { UserStore } from "../../domain/users/store";

// upsertUserProfile は既存挙動として email を trim+小文字化するのみで、
// 空文字列はそのまま保存される（normalizeEmail とは異なる）。

export type UpsertUserProfileInput = {
  userId: string;
  displayName: string;
  email?: string;
};

export async function upsertUserProfile(
  store: UserStore,
  args: UpsertUserProfileInput,
  now: number,
): Promise<void> {
  const email = args.email?.trim().toLowerCase();
  const displayName = resolveProfileDisplayName(args.displayName, email);
  const existing = await store.findByUserId(args.userId);

  if (existing === null) {
    await store.insert({
      userId: args.userId,
      displayName,
      email,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await store.patch(existing.id, {
    displayName,
    email: email ?? existing.email,
    updatedAt: now,
  });
}

export async function getUserIdByEmail(
  store: Pick<UserStore, "findByEmail">,
  email: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const user = await store.findByEmail(normalized);
  return user?.userId ?? null;
}

export type InternalUserSummary = {
  userId: string;
  email?: string;
  displayName: string;
};

export async function getUserById(
  store: Pick<UserStore, "findByUserId">,
  userId: string,
): Promise<InternalUserSummary | null> {
  const user = await store.findByUserId(userId);
  if (user === null) return null;
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
  };
}

export async function clearUserMonthlyIncome(
  store: UserStore,
  userId: string,
  now: number,
): Promise<{ cleared: boolean }> {
  const user = await store.findByUserId(userId);
  if (user === null) return { cleared: false };
  await store.patch(user.id, { monthlyIncome: undefined, updatedAt: now });
  return { cleared: true };
}
