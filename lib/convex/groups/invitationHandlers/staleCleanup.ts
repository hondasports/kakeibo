import type { MutationCtx, QueryCtx } from "../../../../convex/_generated/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  invitationEmailsMatch,
  normalizeEmail,
} from "../../../../convex/groups/lib/groupEmailMatching";
import { readQueryDoc, readQueryDocs } from "../../../../convex/groups/lib/groupQueryHelpers";
import { assessGroupInvitationStaleness } from "../../../domain/groups/groupInvitation";

async function collectStaleGroupInvitationIdsForEmail(
  ctx: Pick<QueryCtx, "db">,
  groupId: Id<"groups">,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const invitationIds = new Set<Id<"groupInvitations">>();

  const considerInvitation = async (invitation: {
    _id: Id<"groupInvitations">;
    status: "pending" | "accepted" | "revoked" | "expired";
    email: string;
    acceptedByUserId?: string;
  }) => {
    if (!invitationEmailsMatch(normalizedEmail, invitation.email)) {
      return;
    }
    const assessment = assessGroupInvitationStaleness(invitation);
    if (assessment === "stale") {
      invitationIds.add(invitation._id);
      return;
    }
    if (assessment === "keep") {
      return;
    }

    const membership = await readQueryDoc(
      ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_user_id", (q) =>
          q.eq("groupId", groupId).eq("userId", invitation.acceptedByUserId!),
        ),
    );
    if (membership === null) {
      invitationIds.add(invitation._id);
    }
  };

  const exactInvitations = await readQueryDocs(
    ctx.db
      .query("groupInvitations")
      .withIndex("by_group_id_and_email", (q) =>
        q.eq("groupId", groupId).eq("email", normalizedEmail),
      ),
  );
  for (const invitation of exactInvitations) {
    await considerInvitation(invitation);
  }

  for (const status of ["pending", "accepted"] as const) {
    const invitations = await readQueryDocs(
      ctx.db
        .query("groupInvitations")
        .withIndex("by_group_id_and_status", (q) => q.eq("groupId", groupId).eq("status", status)),
    );
    for (const invitation of invitations) {
      await considerInvitation(invitation);
    }
  }

  return invitationIds;
}

/** 再招待・再送前に、同一メールの古い pending と所属外の accepted を無効化する */
export async function revokeGroupInvitationsForEmailInGroup(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  email: string,
) {
  const now = Date.now();
  const invitationIds = await collectStaleGroupInvitationIdsForEmail(ctx, groupId, email);

  for (const invitationId of invitationIds) {
    await ctx.db.patch(invitationId, { status: "revoked", updatedAt: now });
  }
}
