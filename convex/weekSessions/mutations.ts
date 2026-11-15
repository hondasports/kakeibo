import { getTodayDateStringInJapan } from "../../lib/domain/common/date";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireGroupMembership } from "../groups/membership";
import { calculateWeekStartDate } from "../../lib/domain/week/weekDates";
import { getWeeklyStartDayForUser } from "../users/weeklySettings";
import { WeekSessionDomainError } from "../../lib/domain/weekSessions/rules";
import {
  createWeekSessionStore,
  weekSessionRecordToDoc,
} from "../../lib/convex/weekSessions/convexWeekSessionStore";
import { getOrCreateWeekSession as getOrCreateWeekSessionUsecase } from "../../lib/usecase/weekSessions";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  if (error instanceof WeekSessionDomainError) throw new ConvexError(error.message);
  throw error;
}

/** getOrCreateCurrentWeekSession mutation の handler ロジック（テスト用に export） */
export async function getOrCreateCurrentWeekSessionHandler(ctx: MutationCtx) {
  const { userId } = await requireGroupMembership(ctx);
  const todayStr = getTodayDateStringInJapan(Date.now());
  const weekStartDay = await getWeeklyStartDayForUser(ctx, userId);
  const weekStartDate = calculateWeekStartDate(todayStr, weekStartDay);

  return getOrCreateWeekSessionHandler(ctx, { weekStartDate });
}

export const getOrCreateCurrentWeekSession = mutation({
  args: {},
  handler: getOrCreateCurrentWeekSessionHandler,
});

/** getOrCreateWeekSession mutation の handler ロジック（テスト用に export） */
export async function getOrCreateWeekSessionHandler(
  ctx: MutationCtx,
  args: { weekStartDate: string },
) {
  const { groupId } = await requireGroupMembership(ctx);

  try {
    const session = await getOrCreateWeekSessionUsecase(
      createWeekSessionStore(ctx),
      groupId,
      args.weekStartDate,
      Date.now,
    );
    return weekSessionRecordToDoc(session);
  } catch (error) {
    convexError(error);
  }
}

export const getOrCreateWeekSession = mutation({
  args: { weekStartDate: v.string() },
  handler: getOrCreateWeekSessionHandler,
});
