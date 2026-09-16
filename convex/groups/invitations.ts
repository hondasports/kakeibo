import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { setGroupClerkOrganizationIdHandler } from "./e2e";
import { assertEmailCanBeInvitedToGroup as assertEmailCanBeInvitedToGroupUsecase } from "../../lib/usecase/groups/assertEmailCanBeInvitedToGroup";
import { createGroupInvitationRecord as createGroupInvitationRecordUsecase } from "../../lib/usecase/groups/createGroupInvitationRecord";
import { deletePendingGroupInvitationRecordByToken as deletePendingGroupInvitationRecordByTokenUsecase } from "../../lib/usecase/groups/deletePendingGroupInvitationRecordByToken";
import {
  createGroupMutationDeps,
  createGroupQueryDeps,
} from "../../lib/convex/groups/groupUsecaseDeps";

export {
  dedupePendingGroupInvitationsByEmail,
  getInvitationEmailKey,
  invitationEmailsMatch,
  invitationEmailsMatchAny,
  sortPendingGroupInvitationsForDisplay,
} from "./lib/groupEmailMatching";

export {
  revokePendingGroupInvitationsForEmailInGroup,
  cancelPendingGroupInvitationHandler,
} from "../../lib/convex/groups/invitationHandlers/revoke";
export { revokeGroupInvitationsForEmailInGroup } from "../../lib/convex/groups/invitationHandlers/staleCleanup";
export {
  acceptGroupInvitationForVerifiedEmailsHandler,
  acceptGroupInvitationHandler,
} from "../../lib/convex/groups/invitationHandlers/accept";

import { cancelPendingGroupInvitationHandler } from "../../lib/convex/groups/invitationHandlers/revoke";
import {
  acceptGroupInvitationForVerifiedEmailsHandler,
  acceptGroupInvitationHandler,
} from "../../lib/convex/groups/invitationHandlers/accept";

/** 所属チェックと承認済み（まだ所属中）チェック。pending の無効化は呼び出し前に revoke すること。 */
export async function assertEmailCanBeInvitedToGroupHandler(
  ctx: Pick<QueryCtx, "db">,
  args: { groupId: Id<"groups">; email: string },
) {
  return await assertEmailCanBeInvitedToGroupUsecase(createGroupQueryDeps(ctx), args);
}

export async function createGroupInvitationRecordHandler(
  ctx: MutationCtx,
  args: {
    groupId: Id<"groups">;
    email: string;
    token: string;
    invitedByUserId: string;
    clerkInvitationId?: string;
  },
) {
  const invitationId = await createGroupInvitationRecordUsecase(createGroupMutationDeps(ctx), args);
  return invitationId as Id<"groupInvitations">;
}

export async function deletePendingGroupInvitationRecordByTokenHandler(
  ctx: MutationCtx,
  args: { token: string },
) {
  const invitationId = await deletePendingGroupInvitationRecordByTokenUsecase(
    createGroupMutationDeps(ctx),
    args,
  );
  return invitationId === null ? null : (invitationId as Id<"groupInvitations">);
}

export const cancelPendingGroupInvitation = mutation({
  args: { invitationId: v.id("groupInvitations") },
  returns: v.object({ clerkInvitationIds: v.array(v.string()) }),
  handler: cancelPendingGroupInvitationHandler,
});

export const assertEmailCanBeInvitedToGroup = internalQuery({
  args: { groupId: v.id("groups"), email: v.string() },
  handler: assertEmailCanBeInvitedToGroupHandler,
});

export const createGroupInvitationRecord = internalMutation({
  args: {
    groupId: v.id("groups"),
    email: v.string(),
    token: v.string(),
    invitedByUserId: v.string(),
    clerkInvitationId: v.optional(v.string()),
  },
  handler: createGroupInvitationRecordHandler,
});

export const deletePendingGroupInvitationRecordByToken = internalMutation({
  args: { token: v.string() },
  handler: deletePendingGroupInvitationRecordByTokenHandler,
});

export const setGroupClerkOrganizationId = internalMutation({
  args: { groupId: v.id("groups"), clerkOrganizationId: v.string() },
  handler: setGroupClerkOrganizationIdHandler,
});

export const acceptGroupInvitation = mutation({
  args: { token: v.string() },
  returns: v.id("groups"),
  handler: acceptGroupInvitationHandler,
});

export const acceptGroupInvitationForVerifiedEmails = internalMutation({
  args: {
    token: v.string(),
    acceptedUserId: v.string(),
    acceptedEmails: v.array(v.string()),
  },
  handler: acceptGroupInvitationForVerifiedEmailsHandler,
});
