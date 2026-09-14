/**
 * users query のユースケース。
 * 認証は presentation 層で済んでいる前提で userId を受け取る。
 */
import { getWeekEndDay, normalizeWeekStartDay } from "../../domain/week/weekDates";
import type { UserStore } from "../../domain/users/store";

export type UserProfile = {
  monthlyIncome: number | null;
  weeklyStartDay: number;
  weeklyEndDay: number;
};

export async function getUserProfile(
  store: Pick<UserStore, "findByUserId">,
  userId: string,
): Promise<UserProfile | undefined> {
  const user = await store.findByUserId(userId);

  if (user === null) {
    return undefined;
  }

  const weeklyStartDay = normalizeWeekStartDay(user.weeklyStartDay);

  return {
    monthlyIncome: user.monthlyIncome ?? null,
    weeklyStartDay,
    weeklyEndDay: getWeekEndDay(weeklyStartDay),
  };
}

export type ReceiptImageConsent = {
  hasAcceptedExternalApiConsent: boolean;
  acceptedAt: number | null;
};

export async function getReceiptImageConsent(
  store: Pick<UserStore, "findByUserId">,
  userId: string,
): Promise<ReceiptImageConsent> {
  const user = await store.findByUserId(userId);
  const acceptedAt = user?.receiptImageExternalApiConsentAcceptedAt ?? null;

  return {
    hasAcceptedExternalApiConsent: acceptedAt !== null,
    acceptedAt,
  };
}
