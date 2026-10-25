import type {
  InvitationAcceptanceConsent,
  InvitationRecipient,
} from "../../../domain/groups/groupInvitation";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../../../../convex/_generated/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import { acceptGroupInvitationForVerifiedEmails } from "../../../usecase/groups/acceptGroupInvitationForVerifiedEmails";
import { previewGroupInvitationForVerifiedEmails } from "../../../usecase/groups/previewGroupInvitationForVerifiedEmails";
import { createGroupQueryDeps, createGroupMutationDeps } from "../groupUsecaseDeps";

export async function acceptGroupInvitationForVerifiedEmailsHandler(
  ctx: MutationCtx,
  args: InvitationRecipient & InvitationAcceptanceConsent,
) {
  const groupId = await acceptGroupInvitationForVerifiedEmails(createGroupMutationDeps(ctx), args);
  return groupId as Id<"groups">;
}

export async function previewGroupInvitationForVerifiedEmailsHandler(
  ctx: QueryCtx,
  args: InvitationRecipient,
) {
  return await previewGroupInvitationForVerifiedEmails(createGroupQueryDeps(ctx), args);
}

export async function acceptGroupInvitationHandler(
  ctx: MutationCtx,
  args: { token: string } & InvitationAcceptanceConsent,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Not authenticated");
  }

  return await acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
    ...args,
    acceptedUserId: identity.tokenIdentifier,
    acceptedEmails: [identity.email ?? ""],
  });
}
