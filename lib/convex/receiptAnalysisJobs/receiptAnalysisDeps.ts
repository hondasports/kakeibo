import type { ActionCtx, MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import {
  createReceiptAnalysisReader,
  createReceiptAnalysisStore,
} from "./convexReceiptAnalysisStore";
import { createReceiptAnalysisScheduler } from "./convexReceiptAnalysisScheduler";
import { createReceiptAnalysisActionRunner } from "./receiptAnalysisActionRunner";

export function createReceiptAnalysisMutationDeps(ctx: MutationCtx) {
  return { store: createReceiptAnalysisStore(ctx), scheduler: createReceiptAnalysisScheduler(ctx) };
}

export function createReceiptAnalysisQueryDeps(ctx: QueryCtx) {
  return { reader: createReceiptAnalysisReader(ctx) };
}

export function createReceiptAnalysisActionDeps(ctx: ActionCtx) {
  return { runner: createReceiptAnalysisActionRunner(ctx) };
}
