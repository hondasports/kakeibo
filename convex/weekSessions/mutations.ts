import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireGroupMembership } from "../groups/membership";
import { calculateWeekStartDate } from "../lib/weekDates";
import { getWeeklyStartDayForUser } from "../users/weeklySettings";
import { formatLocalDate, WeekSessionDomainError } from "../../lib/domain/weekSessions/rules";
import {
  createWeekSessionStore,
  weekSessionRecordToDoc,
} from "../../lib/convex/weekSessions/convexWeekSessionStore";
import {
  completeWeekSession as completeWeekSessionUsecase,
  getOrCreateWeekSession as getOrCreateWeekSessionUsecase,
  updateReviewMemo as updateReviewMemoUsecase,
} from "../../lib/usecase/weekSessions";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  if (error instanceof WeekSessionDomainError) throw new ConvexError(error.message);
  throw error;
}

/** getOrCreateCurrentWeekSession mutation の handler ロジック（テスト用に export） */
export async function getOrCreateCurrentWeekSessionHandler(ctx: MutationCtx) {
  const { userId } = await requireGroupMembership(ctx);
  const todayStr = formatLocalDate(Date.now());
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

/** updateReviewMemo mutation の handler ロジック（テスト用に export） */
export async function updateReviewMemoHandler(
  ctx: MutationCtx,
  args: { weekStartDate: string; reviewMemo: string },
) {
  const { groupId } = await requireGroupMembership(ctx);

  try {
    const session = await updateReviewMemoUsecase(
      createWeekSessionStore(ctx),
      groupId,
      args,
      Date.now,
    );
    return weekSessionRecordToDoc(session);
  } catch (error) {
    convexError(error);
  }
}

export const updateReviewMemo = mutation({
  args: {
    weekStartDate: v.string(),
    reviewMemo: v.string(),
  },
  handler: updateReviewMemoHandler,
});

/** completeWeekSession mutation の handler ロジック（テスト用に export） */
export async function completeWeekSessionHandler(
  ctx: MutationCtx,
  args: { weekStartDate: string; reviewMemo?: string },
) {
  const { groupId } = await requireGroupMembership(ctx);

  try {
    const session = await completeWeekSessionUsecase(
      createWeekSessionStore(ctx),
      groupId,
      args,
      Date.now,
    );
    return weekSessionRecordToDoc(session);
  } catch (error) {
    convexError(error);
  }
}

export const completeWeekSession = mutation({
  args: {
    weekStartDate: v.string(),
    reviewMemo: v.optional(v.string()),
  },
  handler: completeWeekSessionHandler,
});
