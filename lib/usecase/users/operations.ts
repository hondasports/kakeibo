/**
 * users mutation のユースケース。
 * 認証は presentation 層で済んでいる前提で userId を受け取る。
 */
import {
  assertUserFound,
  buildUserInsertFields,
  buildUserUpsertPatch,
  UserDomainError,
  type UserIdentityInput,
} from "../../domain/users/rules";
import { validateMonthlyIncome } from "../../domain/users/monthlyIncome";
import { getWeekEndDay, validateWeekDay } from "../../domain/week/weekDates";
import type { UserStore } from "../../domain/users/store";

// NOTE: by_token_identifier インデックスには Convex の仕様上 unique constraint を付与できない。
// そのため、複数ドキュメントが挿入されないよう upsertUser の呼び出し元で制御すること。
export async function upsertUser(
  store: UserStore,
  identity: UserIdentityInput,
  now: number,
): Promise<void> {
  const existing = await store.findByUserId(identity.userId);

  if (existing === null) {
    await store.insert(buildUserInsertFields(identity, now));
  } else {
    await store.patch(existing.id, buildUserUpsertPatch(identity, existing, now));
  }
}

export async function acceptReceiptImageExternalApiConsent(
  store: UserStore,
  userId: string,
  now: number,
): Promise<void> {
  const user = assertUserFound(await store.findByUserId(userId));

  await store.patch(user.id, {
    receiptImageExternalApiConsentAcceptedAt: user.receiptImageExternalApiConsentAcceptedAt ?? now,
    updatedAt: now,
  });
}

export async function updateMonthlyIncome(
  store: UserStore,
  userId: string,
  monthlyIncome: number | null,
  now: number,
): Promise<void> {
  if (monthlyIncome !== null) {
    const result = validateMonthlyIncome(monthlyIncome);
    if (!result.success) {
      throw new UserDomainError("月収入は0以上の整数で入力してください");
    }
  }

  const user = assertUserFound(await store.findByUserId(userId));

  await store.patch(user.id, {
    monthlyIncome: monthlyIncome ?? undefined,
    updatedAt: now,
  });
}

export async function updateWeeklyDays(
  store: UserStore,
  userId: string,
  args: { weeklyStartDay: number; weeklyEndDay: number },
  now: number,
): Promise<void> {
  const startDayResult = validateWeekDay(args.weeklyStartDay);
  if (!startDayResult.success) {
    throw new UserDomainError("週の開始曜日は0〜6の整数で入力してください");
  }
  const endDayResult = validateWeekDay(args.weeklyEndDay);
  if (!endDayResult.success) {
    throw new UserDomainError("週の終了曜日は0〜6の整数で入力してください");
  }

  const user = assertUserFound(await store.findByUserId(userId));

  await store.patch(user.id, {
    weeklyStartDay: args.weeklyStartDay,
    weeklyEndDay: getWeekEndDay(args.weeklyStartDay),
    updatedAt: now,
  });
}
