/**
 * UserSettingsRepository の Convex 実装。
 * 週開始曜日の解決は convex/users/weeklySettings の既存実装に委譲する。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import { getWeeklyStartDayForUser } from "../../../convex/users/weeklySettings";
import type { UserSettingsRepository } from "../../domain/users/userSettingsRepository";

export function createUserSettingsRepository(ctx: Pick<QueryCtx, "db">): UserSettingsRepository {
  return {
    resolveWeeklyStartDay: (userId) => getWeeklyStartDayForUser(ctx as QueryCtx, userId),
  };
}
