import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  groupMemberListItemValidator,
  groupPendingInvitationListItemValidator,
} from "./validators";
import { getMyGroup as getMyGroupUsecase } from "../../lib/usecase/groups/getMyGroup";
import { listMyGroups as listMyGroupsUsecase } from "../../lib/usecase/groups/listMyGroups";
import { getGroupMembers as getGroupMembersUsecase } from "../../lib/usecase/groups/getGroupMembers";
import { listPendingGroupInvitations as listPendingGroupInvitationsUsecase } from "../../lib/usecase/groups/listPendingGroupInvitations";
import { createGroupQueryDeps } from "../../lib/convex/groups/groupUsecaseDeps";
import {
  getGroupMembership,
  getResolvedMemberships,
  requireGroupMembership,
  requireGroupOwner,
} from "./membership";

export async function getMyGroupHandler(ctx: QueryCtx) {
  const membership = await getGroupMembership(ctx);
  if (membership === null) return null;

  const result = await getMyGroupUsecase(createGroupQueryDeps(ctx), {
    groupId: membership.groupId,
    role: membership.role,
  });
  if (result === null) return null;

  return {
    _id: result.groupId as Id<"groups">,
    name: result.name,
    clerkOrganizationId: result.clerkOrganizationId,
    role: result.role,
    createdAt: result.createdAt,
  };
}

export async function listMyGroupsHandler(ctx: QueryCtx) {
  const { memberships, activeMembership } = await getResolvedMemberships(ctx);
  if (memberships.length === 0) return [];

  const items = await listMyGroupsUsecase(createGroupQueryDeps(ctx), {
    memberships,
    activeGroupId: activeMembership?.groupId,
  });

  return items.map((item) => ({
    _id: item.groupId as Id<"groups">,
    name: item.name,
    clerkOrganizationId: item.clerkOrganizationId,
    role: item.role,
    createdAt: item.createdAt,
    isActive: item.isActive,
  }));
}

export async function getGroupMembersHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  return await getGroupMembersUsecase({ groupId }, createGroupQueryDeps(ctx));
}

export async function listPendingGroupInvitationsHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupOwner(ctx);

  const items = await listPendingGroupInvitationsUsecase({ groupId }, createGroupQueryDeps(ctx));
  return items.map((item) => ({
    _id: item.invitationId as Id<"groupInvitations">,
    email: item.email,
    status: item.status,
    createdAt: item.createdAt,
  }));
}

export const getMyGroup = query({
  args: {},
  handler: getMyGroupHandler,
});

export const listMyGroups = query({
  args: {},
  handler: listMyGroupsHandler,
});

export const getGroupMembers = query({
  args: {},
  returns: v.array(groupMemberListItemValidator),
  handler: getGroupMembersHandler,
});

export const listPendingGroupInvitations = query({
  args: {},
  returns: v.array(groupPendingInvitationListItemValidator),
  handler: listPendingGroupInvitationsHandler,
});
