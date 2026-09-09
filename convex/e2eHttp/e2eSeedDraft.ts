import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { readE2eJsonObject, requireE2eSecret, requireE2eUserId } from "./e2eAuth";

const MAX_E2E_FIELD_LENGTH = 512;

async function resolveUserId(
  ctx: ActionCtx,
  body: { userId?: string; email?: string },
): Promise<string | null> {
  if (body.email) {
    const userId = await ctx.runQuery(internal.users.internal.getUserIdByEmail, {
      email: body.email,
    });
    if (userId) return userId;
  }
  return body.userId ?? null;
}

async function resolveE2eScope(
  ctx: ActionCtx,
  body: { userId?: string; email?: string; groupId?: string },
): Promise<{ userId: string; groupId: Id<"groups"> } | Response> {
  const resolvedUserId = await resolveUserId(ctx, body);
  if (!resolvedUserId) {
    return new Response(JSON.stringify({ error: "userId or email is required." }), {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }
  const userAuthorizationError = requireE2eUserId(resolvedUserId);
  if (userAuthorizationError) return userAuthorizationError;

  const configuredGroupId = await ctx.runQuery(internal.groups.e2e.getGroupIdByUserId, {
    userId: resolvedUserId,
  });
  if (!configuredGroupId) {
    return new Response(JSON.stringify({ error: "E2E user is not in a group." }), {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  if (body.groupId) {
    const requestedGroupId = await ctx.runQuery(internal.groups.e2e.normalizeGroupId, {
      groupId: body.groupId,
    });
    if (requestedGroupId === null || requestedGroupId !== configuredGroupId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }
  }

  return { userId: resolvedUserId, groupId: configuredGroupId };
}

function isSeedBody(body: unknown): body is { userId?: string; email?: string; groupId?: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  return ["userId", "email", "groupId"].every(
    (key) =>
      candidate[key] === undefined ||
      (typeof candidate[key] === "string" && candidate[key].length <= MAX_E2E_FIELD_LENGTH),
  );
}

function invalidJsonResponse() {
  return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
    status: 400,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

export const e2eSeedAiExpenseDraftHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const bodyResult = await readE2eJsonObject<{ userId?: string; email?: string; groupId?: string }>(
    req,
  );
  if (bodyResult instanceof Response || !isSeedBody(bodyResult)) {
    return bodyResult instanceof Response ? bodyResult : invalidJsonResponse();
  }
  const body = bodyResult;

  const scope = await resolveE2eScope(ctx, body);
  if (scope instanceof Response) return scope;

  const categoryId = await ctx.runMutation(internal.categories.internal.ensureE2eCategoryByUser, {
    groupId: scope.groupId,
    name: "E2Eカテゴリ-食費-Issue322",
    color: "#AAB7C4",
  });
  const secondaryCategoryId = await ctx.runMutation(
    internal.categories.internal.ensureE2eCategoryByUser,
    {
      groupId: scope.groupId,
      name: "E2Eカテゴリ-日用品-Issue322",
      color: "#A6B28B",
    },
  );
  const draftId = await ctx.runMutation(
    internal.aiExpenseDrafts.internal.createE2eReadyDraftForUser,
    {
      groupId: scope.groupId,
      createdByUserId: scope.userId,
      categoryId,
      secondaryCategoryId,
    },
  );

  return new Response(JSON.stringify({ draftId, categoryId, secondaryCategoryId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});

export const e2eSeedTaxReviewDraftHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const bodyResult = await readE2eJsonObject<{ userId?: string; email?: string; groupId?: string }>(
    req,
  );
  if (bodyResult instanceof Response || !isSeedBody(bodyResult)) {
    return bodyResult instanceof Response ? bodyResult : invalidJsonResponse();
  }
  const body = bodyResult;

  const scope = await resolveE2eScope(ctx, body);
  if (scope instanceof Response) return scope;

  const categoryId = await ctx.runMutation(internal.categories.internal.ensureE2eCategoryByUser, {
    groupId: scope.groupId,
    name: "E2Eカテゴリ-食費-税レビュー",
    color: "#AAB7C4",
  });
  const draftId = await ctx.runMutation(
    internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser,
    {
      groupId: scope.groupId,
      createdByUserId: scope.userId,
      categoryId,
    },
  );

  return new Response(JSON.stringify({ draftId, categoryId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});

export const e2eSeedMixedTaxReviewDraftHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) return authError;

  const bodyResult = await readE2eJsonObject<{ userId?: string; email?: string; groupId?: string }>(
    req,
  );
  if (bodyResult instanceof Response || !isSeedBody(bodyResult)) {
    return bodyResult instanceof Response ? bodyResult : invalidJsonResponse();
  }
  const scope = await resolveE2eScope(ctx, bodyResult);
  if (scope instanceof Response) return scope;

  const categoryId = await ctx.runMutation(internal.categories.internal.ensureE2eCategoryByUser, {
    groupId: scope.groupId,
    name: "E2Eカテゴリ-混在税レビュー",
    color: "#AAB7C4",
  });
  const draftId = await ctx.runMutation(
    internal.aiExpenseDrafts.internal.createE2eMixedTaxReviewDraftForUser,
    {
      groupId: scope.groupId,
      createdByUserId: scope.userId,
      categoryId,
    },
  );

  return new Response(JSON.stringify({ draftId, categoryId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});

export const e2eSeedTaxSummaryConflictDraftHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const bodyResult = await readE2eJsonObject<{ userId?: string; email?: string; groupId?: string }>(
    req,
  );
  if (bodyResult instanceof Response || !isSeedBody(bodyResult)) {
    return bodyResult instanceof Response ? bodyResult : invalidJsonResponse();
  }
  const body = bodyResult;

  const scope = await resolveE2eScope(ctx, body);
  if (scope instanceof Response) return scope;

  const categoryId = await ctx.runMutation(internal.categories.internal.ensureE2eCategoryByUser, {
    groupId: scope.groupId,
    name: "E2Eカテゴリ-食費-税summary",
    color: "#AAB7C4",
  });
  const draftId = await ctx.runMutation(
    internal.aiExpenseDrafts.internal.createE2eTaxSummaryConflictDraftForUser,
    {
      groupId: scope.groupId,
      createdByUserId: scope.userId,
      categoryId,
    },
  );

  return new Response(JSON.stringify({ draftId, categoryId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});

export const e2eSeedPendingGroupInvitationHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const bodyResult = await readE2eJsonObject<{
    userId?: string;
    email?: string;
    groupId?: string;
    invitationEmail?: string;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;
  const body = bodyResult;
  if (
    !isSeedBody(body) ||
    (body.invitationEmail !== undefined &&
      (typeof body.invitationEmail !== "string" || body.invitationEmail.length > 320))
  ) {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  const scope = await resolveE2eScope(ctx, body);
  if (scope instanceof Response) return scope;

  const invitationEmail = body.invitationEmail?.trim().toLowerCase();
  if (!invitationEmail) {
    return new Response(JSON.stringify({ error: "invitationEmail is required." }), {
      status: 400,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  const invitationId = await ctx.runMutation(internal.groups.e2e.seedPendingGroupInvitationForE2e, {
    groupId: scope.groupId,
    email: invitationEmail,
    invitedByUserId: scope.userId,
  });

  return new Response(JSON.stringify({ invitationId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});

export const e2eSeedUnallocatedTaxDraftHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E seeding is not enabled in this environment.");
  if (authError) return authError;

  const bodyResult = await readE2eJsonObject<{ userId?: string; email?: string; groupId?: string }>(
    req,
  );
  if (bodyResult instanceof Response || !isSeedBody(bodyResult)) {
    return bodyResult instanceof Response ? bodyResult : invalidJsonResponse();
  }
  const scope = await resolveE2eScope(ctx, bodyResult);
  if (scope instanceof Response) return scope;

  const categoryId = await ctx.runMutation(internal.categories.internal.ensureE2eCategoryByUser, {
    groupId: scope.groupId,
    name: "E2Eカテゴリ-税配分",
    color: "#AAB7C4",
  });
  const draftId = await ctx.runMutation(
    internal.aiExpenseDrafts.internal.createE2eUnallocatedTaxDraftForUser,
    {
      groupId: scope.groupId,
      createdByUserId: scope.userId,
      categoryId,
    },
  );

  return new Response(JSON.stringify({ draftId, categoryId }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});
