/**
 * httpAction から claimEvents mutation への橋渡しアダプタ。
 * ctx.runMutation の呼び出しを presentation 層から隔離する。
 */
import type { ActionCtx } from "../../../convex/_generated/server";
import { internal } from "../../../convex/_generated/api";
import type { LineWebhookEventInput } from "../../domain/lineWebhook/payload";

export async function runClaimEvents(
  ctx: ActionCtx,
  events: LineWebhookEventInput[],
): Promise<void> {
  await ctx.runMutation(internal.lineWebhook.internal.claimEvents, { events });
}
