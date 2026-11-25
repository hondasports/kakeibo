"use node";

import { createClerkClient } from "@clerk/backend";
import { reverificationError } from "@clerk/backend/internal";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { classifyClerkDeletionError } from "../lib/domain/accountDeletion/clerkError";
import { evaluateStrictReverification } from "../lib/domain/accountDeletion/reverification";
import { createClerkSessionTokenVerifier } from "../lib/convex/accountDeletion/clerkSessionTokenVerifier";
import type { SessionTokenVerifier } from "../lib/domain/accountDeletion/sessionTokenVerifier";

const REAUTHENTICATION_FAILED_MESSAGE = "Reauthentication could not be verified";

const reverificationHintValidator = v.object({
  clerk_error: v.object({
    type: v.literal("forbidden"),
    reason: v.literal("reverification-error"),
    metadata: v.object({ reverification: v.literal("strict") }),
  }),
});

type StrictReverificationHint = {
  clerk_error: {
    type: "forbidden";
    reason: "reverification-error";
    metadata: { reverification: "strict" };
  };
};

type RequestAccountDeletionArgs = {
  confirmationText: string;
  sessionToken: string;
};

function createStrictReverificationHint(): StrictReverificationHint {
  return reverificationError("strict") as StrictReverificationHint;
}

type RequestAccountDeletionDeps = {
  sessionTokenVerifier?: SessionTokenVerifier;
};

export async function handleRequestAccountDeletion(
  ctx: ActionCtx,
  args: RequestAccountDeletionArgs,
  deps: RequestAccountDeletionDeps = {},
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");

  const verifier =
    deps.sessionTokenVerifier ??
    createClerkSessionTokenVerifier({ secretKey: process.env.CLERK_SECRET_KEY });
  let verification;
  try {
    verification = await verifier.verify(args.sessionToken);
  } catch {
    throw new ConvexError(REAUTHENTICATION_FAILED_MESSAGE);
  }
  if (verification.kind !== "verified") {
    throw new ConvexError(REAUTHENTICATION_FAILED_MESSAGE);
  }
  if (verification.claims.iss !== identity.issuer || verification.claims.sub !== identity.subject) {
    throw new ConvexError(REAUTHENTICATION_FAILED_MESSAGE);
  }
  const reverificationEvaluation = evaluateStrictReverification(verification.claims.fva);
  if (reverificationEvaluation === "invalid") {
    throw new ConvexError(REAUTHENTICATION_FAILED_MESSAGE);
  }
  if (reverificationEvaluation === "reverification_required") {
    return createStrictReverificationHint();
  }

  return await ctx.runMutation(internal.accountDeletion.requestAccountDeletion, {
    confirmationText: args.confirmationText,
    tokenIdentifier: identity.tokenIdentifier,
    clerkUserId: identity.subject,
  });
}

export const requestAccountDeletion = action({
  args: {
    confirmationText: v.string(),
    sessionToken: v.string(),
  },
  returns: v.union(v.id("accountDeletionRequests"), reverificationHintValidator),
  handler: async (ctx, args): Promise<Id<"accountDeletionRequests"> | StrictReverificationHint> =>
    await handleRequestAccountDeletion(ctx, args),
});

export const processAccountDeletion = internalAction({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(internal.accountDeletion.getRequest, args);
    if (!request || request.status === "completed") return;
    if (request.status === "identity_deleted" || request.status === "finalization_retry_wait") {
      try {
        await ctx.runMutation(internal.accountDeletion.finalizeAccountDeletion, args);
      } catch {
        await ctx.runMutation(internal.accountDeletion.scheduleRetry, {
          ...args,
          code: "finalization_failed",
          message: "退会処理の完了に失敗しました。",
          finalization: true,
        });
      }
      return;
    }
    if (request.status === "preparing_groups" || request.status === "purging_groups") {
      const purgeState = await ctx.runMutation(
        internal.accountDeletion.advanceAccountDeletionPurge,
        args,
      );
      if (purgeState !== "ready") return;
    }
    // 状態遷移が許可されない（failed など）場合は Clerk 削除を再実行しない。
    const marked = await ctx.runMutation(internal.accountDeletion.markDeletingIdentity, args);
    if (!marked) return;
    try {
      if (process.env.APP_ENV === "production") {
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) throw new Error("Clerk configuration unavailable");
        await createClerkClient({ secretKey }).users.deleteUser(request.clerkUserId);
      }
    } catch (error) {
      const result = classifyClerkDeletionError(error);
      if (result.kind === "failed" || result.kind === "retryable") {
        await ctx.runMutation(internal.accountDeletion.scheduleRetry, {
          ...args,
          code: result.code,
          message: result.message,
          finalization: false,
        });
        return;
      }
    }
    const identityDeleted = await ctx.runMutation(
      internal.accountDeletion.markIdentityDeleted,
      args,
    );
    if (!identityDeleted) return;
    try {
      await ctx.runMutation(internal.accountDeletion.finalizeAccountDeletion, args);
    } catch {
      await ctx.runMutation(internal.accountDeletion.scheduleRetry, {
        ...args,
        code: "finalization_failed",
        message: "退会処理の完了に失敗しました。",
        finalization: true,
      });
    }
  },
});
