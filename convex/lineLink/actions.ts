"use node";

import { ConvexError, v } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { requireAuthenticatedUserId } from "../users/auth";
import { lineLinkFeedbackValidator } from "./model";
import { createLineLinkActionDeps } from "../../lib/convex/lineLink/lineLinkDeps";
import type { LineProviderClient } from "../../lib/domain/lineLink/provider";
import { completeLineLink } from "../../lib/usecase/lineLink/completeLineLink";
import { startLineLink } from "../../lib/usecase/lineLink/startLineLink";

export async function startLineLinkHandler(ctx: ActionCtx): Promise<{ authorizationUrl: string }> {
  const userId = await requireAuthenticatedUserId(ctx);
  try {
    return await startLineLink(createLineLinkActionDeps(ctx), userId);
  } catch (error) {
    if (error instanceof Error && error.message === "LINE integration is unavailable") {
      throw new ConvexError("LINE integration is unavailable");
    }
    throw error;
  }
}

export const start = action({
  args: {},
  returns: v.object({ authorizationUrl: v.string() }),
  handler: startLineLinkHandler,
});

export async function completeLineLinkHandler(
  ctx: ActionCtx,
  args: { state: string; code: string },
  provider?: LineProviderClient,
) {
  const userId = await requireAuthenticatedUserId(ctx);
  return completeLineLink(createLineLinkActionDeps(ctx, provider), userId, args);
}

export const complete = action({
  args: { state: v.string(), code: v.string() },
  returns: lineLinkFeedbackValidator,
  handler: completeLineLinkHandler,
});

export type { LineProviderClient } from "../../lib/domain/lineLink/provider";
export {
  exchangeAndVerifyLineCode,
  sha256,
  validateLineIdTokenClaims,
} from "../../lib/convex/lineLink/lineProviderClient";
