import type { QueryCtx } from "../_generated/server";
import { createUserReader } from "../../lib/convex/users/convexUserStore";
import { getWeeklyStartDayForUser as getWeeklyStartDayForUserUsecase } from "../../lib/usecase/users";

/** ユーザー設定から週開始曜日を取得する。未保存の場合は月曜日始まりにする。 */
export const getWeeklyStartDayForUser = async (ctx: QueryCtx, userId: string): Promise<number> => {
  return await getWeeklyStartDayForUserUsecase(createUserReader(ctx), userId);
};
