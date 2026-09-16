import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import {
  createLineAccountLinkReader,
  createLineAccountLinkStore,
} from "./convexLineAccountLinkStore";
import { createLineLinkAuditLogStore } from "./convexLineLinkAuditLogStore";
import { createLineLinkRequestStore } from "./convexLineLinkRequestStore";

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
