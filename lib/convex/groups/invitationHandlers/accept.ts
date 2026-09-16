import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../../convex/_generated/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import { acceptGroupInvitationForVerifiedEmails } from "../../../usecase/groups/acceptGroupInvitationForVerifiedEmails";
import { createGroupMutationDeps } from "../groupUsecaseDeps";

export async function acceptGroupInvitationForVerifiedEmailsHandler(
  ctx: MutationCtx,
  args: { token: string; acceptedUserId: string; acceptedEmails: string[] },
) {
  const groupId = await acceptGroupInvitationForVerifiedEmails(createGroupMutationDeps(ctx), args);
  return groupId as Id<"groups">;
}

export async function acceptGroupInvitationHandler(ctx: MutationCtx, args: { token: string }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Not authenticated");
  }

  return await acceptGroupInvitationForVerifiedEmailsHandler(ctx, {
    token: args.token,
    acceptedUserId: identity.tokenIdentifier,
    acceptedEmails: [identity.email ?? ""],
  });
}
