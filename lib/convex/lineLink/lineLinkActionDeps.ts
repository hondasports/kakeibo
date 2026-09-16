"use node";

import type { ActionCtx } from "../../../convex/_generated/server";
import type { LineProviderClient } from "../../domain/lineLink/provider";
import { createLineLinkScheduler } from "./convexLineLinkScheduler";
import { createLineLinkActionRunner } from "./lineLinkActionRunner";
import { getLineIntegrationMode, getLineLoginConfiguration } from "./lineIntegrationConfig";
import { lineProviderClient, randomUrlSafeValue, sha256 } from "./lineProviderClient";

export function createLineLinkActionDeps(
  ctx: ActionCtx,
  provider: LineProviderClient = lineProviderClient,
) {
  return {
    runner: createLineLinkActionRunner(ctx),
    scheduler: createLineLinkScheduler(ctx),
    provider,
    getMode: getLineIntegrationMode,
    getRealConfiguration: getLineLoginConfiguration,
    randomUrlSafeValue,
    hash: sha256,
    now: Date.now,
  };
}
