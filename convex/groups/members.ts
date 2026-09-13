import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { GroupAdminRole } from "./adminGuards";
import { requireGroupOwner } from "./membership";
import { addMemberByEmail as addMemberByEmailUsecase } from "../../lib/usecase/groups/addMemberByEmail";
import { removeMember as removeMemberUsecase } from "../../lib/usecase/groups/removeMember";
import { changeMemberRole as changeMemberRoleUsecase } from "../../lib/usecase/groups/changeMemberRole";
import { transferGroupOwnership as transferGroupOwnershipUsecase } from "../../lib/usecase/groups/transferGroupOwnership";
import { createGroupMutationDeps } from "../../lib/convex/groups/groupUsecaseDeps";

export async function addMemberByEmailHandler(ctx: MutationCtx, args: { email: string }) {
  const { groupId } = await requireGroupOwner(ctx);
  return await addMemberByEmailUsecase({ groupId }, createGroupMutationDeps(ctx), args);
}

export async function removeMemberHandler(ctx: MutationCtx, args: { targetUserId: string }) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  return await removeMemberUsecase({ groupId, userId }, createGroupMutationDeps(ctx), args);
}

export async function changeMemberRoleHandler(
  ctx: MutationCtx,
  args: { targetUserId: string; newRole: GroupAdminRole },
) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  return await changeMemberRoleUsecase({ groupId, userId }, createGroupMutationDeps(ctx), args);
}

export async function transferGroupOwnershipHandler(
  ctx: MutationCtx,
  args: { targetUserId: string },
) {
  const { groupId, userId, membershipId } = await requireGroupOwner(ctx);
  return await transferGroupOwnershipUsecase(
    { groupId, userId, membershipId },
    createGroupMutationDeps(ctx),
    args,
  );
}

export const addMemberByEmail = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: addMemberByEmailHandler,
});

export const removeMember = mutation({
  args: { targetUserId: v.string() },
  returns: v.null(),
  handler: removeMemberHandler,
});

export const changeMemberRole = mutation({
  args: {
    targetUserId: v.string(),
    newRole: v.union(v.literal("owner"), v.literal("member")),
  },
  returns: v.null(),
  handler: changeMemberRoleHandler,
});

export const transferGroupOwnership = mutation({
  args: { targetUserId: v.string() },
  returns: v.null(),
  handler: transferGroupOwnershipHandler,
});
