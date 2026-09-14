import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireGroupMembership } from "../groups/membership";
import {
  createWeekSessionReader,
  weekSessionRecordToDoc,
} from "../../lib/convex/weekSessions/convexWeekSessionStore";
import { getWeekSession as getWeekSessionUsecase } from "../../lib/usecase/weekSessions";

/** getWeekSession query の handler ロジック（テスト用に export） */
export async function getWeekSessionHandler(ctx: QueryCtx, args: { weekStartDate: string }) {
  const { groupId } = await requireGroupMembership(ctx);

  const session = await getWeekSessionUsecase(
    createWeekSessionReader(ctx),
    groupId,
    args.weekStartDate,
  );

  return session === null ? null : weekSessionRecordToDoc(session);
}

export const getWeekSession = query({
  args: { weekStartDate: v.string() },
  handler: getWeekSessionHandler,
});
