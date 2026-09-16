/**
 * 週設定ユースケース。他ドメイン（weekSessions・receipts・lineWebhook 等）の
 * presentation 層から利用される共有 helper。
 */
import { normalizeWeekStartDay } from "../../domain/week/weekDates";
import type { UserStore } from "../../domain/users/store";

/** ユーザー設定から週開始曜日を取得する。未保存の場合は月曜日始まりにする。 */
export async function getWeeklyStartDayForUser(
  store: Pick<UserStore, "findByUserId">,
  userId: string,
): Promise<number> {
  const user = await store.findByUserId(userId);
  return normalizeWeekStartDay(user?.weeklyStartDay);
}
