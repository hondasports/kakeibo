import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionCtx } from "../../../convex/_generated/server";
import type { LineLinkActionRunner } from "../../domain/lineLink/actionRunner";

export function createLineLinkActionRunner(
  ctx: Pick<ActionCtx, "runMutation">,
): LineLinkActionRunner {
  return {
    expireRequests: (now, limit) =>
      ctx.runMutation(internal.lineLink.internal.expireRequests, { now, limit }),
    async createRequest(args) {
      return await ctx.runMutation(internal.lineLink.internal.createRequest, args);
    },
    claimRequest: (stateHash, userId) =>
      ctx.runMutation(internal.lineLink.internal.claimRequest, { stateHash, userId }),
    finalizeRequest: (args) =>
      ctx.runMutation(internal.lineLink.internal.finalizeRequest, {
        ...args,
        requestId: args.requestId as Id<"lineLinkRequests">,
      }),
    async recordFailedRequest(requestId, userId, reasonCode) {
      await ctx.runMutation(internal.lineLink.internal.recordFailedRequest, {
        requestId: requestId as Id<"lineLinkRequests">,
        userId,
        reasonCode,
      });
    },
  };
}
