import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { createWeekSessionStore } from "../../lib/convex/weekSessions/convexWeekSessionStore";
import { resetWeekSession as resetWeekSessionUsecase } from "../../lib/usecase/weekSessions";

export async function resetWeekSessionForUserHandler(
  ctx: MutationCtx,
  { groupId, weekStartDate }: { groupId: Id<"groups">; weekStartDate: string },
) {
  return await resetWeekSessionUsecase(
    createWeekSessionStore(ctx),
    groupId,
    weekStartDate,
    Date.now,
  );
}

/**
 * 指定グループ・指定週の週次セッションを draft に戻す。
 *
 * この mutation は internalMutation として定義されており、外部クライアントから
 * 直接呼び出せない。E2E テスト用の HTTP エンドポイント（convex/http.ts）経由でのみ呼び出す。
 */
export const resetWeekSessionForUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    weekStartDate: v.string(),
  },
  handler: resetWeekSessionForUserHandler,
});
