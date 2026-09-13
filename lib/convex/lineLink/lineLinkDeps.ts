import type { ActionCtx, MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { LineProviderClient } from "../../domain/lineLink/provider";
import {
  createLineAccountLinkReader,
  createLineAccountLinkStore,
} from "./convexLineAccountLinkStore";
import { createLineLinkAuditLogStore } from "./convexLineLinkAuditLogStore";
import { createLineLinkRequestStore } from "./convexLineLinkRequestStore";
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

export function createLineLinkMutationDeps(ctx: MutationCtx) {
  return {
    requests: createLineLinkRequestStore(ctx),
    accountLinks: createLineAccountLinkStore(ctx),
    audits: createLineLinkAuditLogStore(ctx),
  };
}

export function createLineLinkQueryDeps(ctx: QueryCtx) {
  return {
    accountLinks: createLineAccountLinkReader(ctx),
  };
}
