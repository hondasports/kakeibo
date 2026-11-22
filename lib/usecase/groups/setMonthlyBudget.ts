/**
 * グループの月予算を設定・解除するユースケース。
 * 設定はオーナーのみ（権限確認は presentation 層で解決済み）、閲覧はメンバー全員。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { assertGroupNotDeletedOrThrow, normalizeMonthlyBudgetYenOrThrow } from "./validation";

export async function setMonthlyBudget(
  ctx: UsecaseGroupContext,
  deps: Pick<GroupMutationDeps, "groups" | "auditLog">,
  args: { monthlyBudgetYen: number | null },
): Promise<string> {
  const monthlyBudgetYen = normalizeMonthlyBudgetYenOrThrow(args.monthlyBudgetYen);

  const group = await deps.groups.get(ctx.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }
  assertGroupNotDeletedOrThrow(group);

  if (group.monthlyBudgetYen === monthlyBudgetYen) {
    return ctx.groupId;
  }

  await deps.groups.patch(ctx.groupId, {
    monthlyBudgetYen,
    updatedAt: Date.now(),
  });

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "group_monthly_budget_changed",
    targetKind: "group",
    targetId: ctx.groupId,
    targetLabel: group.name,
    beforeValue: group.monthlyBudgetYen?.toString() ?? "未設定",
    afterValue: monthlyBudgetYen?.toString() ?? "未設定",
  });

  return ctx.groupId;
}
