"use node";

import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import type { ActionCtx } from "../../../../convex/_generated/server";
import { api, internal } from "../../../../convex/_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ClerkInvitationDomainError } from "../../../domain/groups/invitationFlow";
import {
  cancelPendingGroupInvitation,
  inviteMember,
  type CancelClerkServices,
  type InviteClerkServices,
  type ClerkInvitationStore,
  type InviteMemberResult,
} from "../../../usecase/groups/clerkInvitationActions";
import { buildClerkInvitationParams, buildInvitationRedirectUrl } from "./redirectUrls";

type InviteMemberArgs = {
  email: string;
  redirectUrl: string;
};

type ClerkInvitationClient = {
  invitations: Pick<ReturnType<typeof getClerkClient>["invitations"], "createInvitation">;
};

type InviteMemberDeps = {
  createToken: () => string;
  getClerkClient: () => ClerkInvitationClient;
};

type CancelPendingGroupInvitationArgs = {
  invitationId: Id<"groupInvitations">;
};

type CancelPendingGroupInvitationDeps = {
  getClerkClient: () => {
    invitations: {
      revokeInvitation: (invitationId: string) => Promise<unknown>;
    };
  };
};

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new ConvexError(
      "CLERK_SECRET_KEY が設定されていません。Convex Dashboard で環境変数を設定してください",
    );
  }

  return createClerkClient({ secretKey });
}

function createInvitationStore(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
): ClerkInvitationStore {
  return {
    getMyGroup: () => ctx.runQuery(api.groups.queries.getMyGroup, {}),
    getAuthenticatedUserId: () => ctx.runQuery(api.users.queries.getAuthenticatedUserId, {}),
    createGroupInvitationRecord: (input) =>
      ctx.runMutation(internal.groups.invitations.createGroupInvitationRecord, {
        groupId: input.groupId as Id<"groups">,
        email: input.email,
        token: input.token,
        invitedByUserId: input.invitedByUserId,
        ...(input.clerkInvitationId !== undefined
          ? { clerkInvitationId: input.clerkInvitationId }
          : {}),
      }),
    deletePendingGroupInvitationRecordByToken: (token) =>
      ctx.runMutation(internal.groups.invitations.deletePendingGroupInvitationRecordByToken, {
        token,
      }),
    cancelPendingGroupInvitation: (invitationId) =>
      ctx.runMutation(api.groups.invitations.cancelPendingGroupInvitation, {
        invitationId: invitationId as Id<"groupInvitations">,
      }),
  };
}

function toConvexBoundaryError(error: unknown): never {
  if (error instanceof ClerkInvitationDomainError) {
    throw new ConvexError(error.message);
  }
  throw error;
}

export async function cancelPendingGroupInvitationHandler(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  args: CancelPendingGroupInvitationArgs,
  deps: CancelPendingGroupInvitationDeps = {
    getClerkClient,
  },
): Promise<null> {
  const services: CancelClerkServices = {
    getClerk: deps.getClerkClient,
    warn: (message, errorName) => console.warn(message, errorName),
  };
  try {
    return await cancelPendingGroupInvitation(createInvitationStore(ctx), services, {
      invitationId: args.invitationId,
    });
  } catch (error) {
    toConvexBoundaryError(error);
  }
}

export async function inviteMemberHandler(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  args: InviteMemberArgs,
  deps: InviteMemberDeps = {
    createToken: randomUUID,
    getClerkClient,
  },
): Promise<InviteMemberResult> {
  const services: InviteClerkServices = {
    createToken: deps.createToken,
    buildRedirectUrl: buildInvitationRedirectUrl,
    buildClerkInvitationParams: (email, redirectUrl, groupId, token) =>
      buildClerkInvitationParams(email, redirectUrl, groupId as Id<"groups">, token),
    getClerk: deps.getClerkClient,
    warn: (message, errorName) => console.warn(message, errorName),
  };
  try {
    return await inviteMember(createInvitationStore(ctx), services, args);
  } catch (error) {
    toConvexBoundaryError(error);
  }
}

export { getClerkClient };
