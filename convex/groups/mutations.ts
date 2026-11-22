import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAuthenticatedUserId } from "../users/auth";
import { requireGroupOwner } from "./membership";
import { createGroup as createGroupUsecase } from "../../lib/usecase/groups/createGroup";
import { updateGroupName as updateGroupNameUsecase } from "../../lib/usecase/groups/updateGroupName";
import { setActiveGroup as setActiveGroupUsecase } from "../../lib/usecase/groups/setActiveGroup";
import { setMonthlyBudget as setMonthlyBudgetUsecase } from "../../lib/usecase/groups/setMonthlyBudget";
import { createGroupMutationDeps } from "../../lib/convex/groups/groupUsecaseDeps";

export async function createGroupHandler(ctx: MutationCtx, args: { name: string }) {
  const userId = await requireAuthenticatedUserId(ctx);
  const groupId = await createGroupUsecase({ userId }, createGroupMutationDeps(ctx), args);
  return groupId as Id<"groups">;
}

/**
 * active group の名前を更新する（オーナーのみ）。
 * @returns 更新したグループ ID
 */
export async function updateGroupNameHandler(ctx: MutationCtx, args: { name: string }) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  const updated = await updateGroupNameUsecase(
    { groupId, userId },
    createGroupMutationDeps(ctx),
    args,
  );
  return updated as Id<"groups">;
}

export async function setActiveGroupHandler(ctx: MutationCtx, args: { groupId: Id<"groups"> }) {
  const userId = await requireAuthenticatedUserId(ctx);
  const updated = await setActiveGroupUsecase({ userId }, createGroupMutationDeps(ctx), args);
  return updated as Id<"groups">;
}

export const createGroup = mutation({
  args: { name: v.string() },
  returns: v.id("groups"),
  handler: createGroupHandler,
});

export const updateGroupName = mutation({
  args: { name: v.string() },
  returns: v.id("groups"),
  handler: updateGroupNameHandler,
});

export const setActiveGroup = mutation({
  args: { groupId: v.id("groups") },
  returns: v.id("groups"),
  handler: setActiveGroupHandler,
});

/**
 * active group の月予算を設定・解除する（オーナーのみ）。
 * monthlyBudgetYen = null で予算解除。
 */
export async function setMonthlyBudgetHandler(
  ctx: MutationCtx,
  args: { monthlyBudgetYen: number | null },
) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  const updated = await setMonthlyBudgetUsecase(
    { groupId, userId },
    createGroupMutationDeps(ctx),
    args,
  );
  return updated as Id<"groups">;
}

export const setMonthlyBudget = mutation({
  args: { monthlyBudgetYen: v.union(v.number(), v.null()) },
  returns: v.id("groups"),
  handler: setMonthlyBudgetHandler,
});
