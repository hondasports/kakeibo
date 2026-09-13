import type { MutationCtx } from "../../../../convex/_generated/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  invitationEmailsMatch,
  normalizeEmail,
} from "../../../../convex/groups/lib/groupEmailMatching";
import { readQueryDocs } from "../../../../convex/groups/lib/groupQueryHelpers";
import { requireGroupOwner } from "../../../../convex/groups/membership";
import { cancelPendingGroupInvitation } from "../../../usecase/groups/cancelPendingGroupInvitation";
import { createGroupMutationDeps } from "../groupUsecaseDeps";

export async function revokePendingGroupInvitationsForEmailInGroup(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  email: string,
): Promise<string[]> {
  const normalizedEmail = normalizeEmail(email);
  const now = Date.now();
  const clerkInvitationIds: string[] = [];

  const pendingInvitations = await readQueryDocs(
    ctx.db
      .query("groupInvitations")
      .withIndex("by_group_id_and_status", (q) => q.eq("groupId", groupId).eq("status", "pending")),
  );

  for (const invitation of pendingInvitations) {
    if (!invitationEmailsMatch(normalizedEmail, invitation.email)) {
      continue;
    }

    await ctx.db.patch(invitation._id, { status: "revoked", updatedAt: now });
    if (invitation.clerkInvitationId) {
      clerkInvitationIds.push(invitation.clerkInvitationId);
    }
  }

  return clerkInvitationIds;
}

export async function cancelPendingGroupInvitationHandler(
  ctx: MutationCtx,
  args: { invitationId: Id<"groupInvitations"> },
) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  return await cancelPendingGroupInvitation(
    { groupId, userId },
    createGroupMutationDeps(ctx),
    args,
  );
}
