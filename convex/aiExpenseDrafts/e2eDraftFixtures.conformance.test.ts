// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { judgeDraftAmountAndTax } from "../../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";
import type { E2eTaxReviewReceiptCase } from "./e2eDraftFixtures";

type SeedCase =
  | { label: string; seed: "ready" | "mixed" | "summaryConflict" | "unallocated" }
  | { label: string; seed: "taxReview"; receiptCase?: E2eTaxReviewReceiptCase };

const summaryVariants = [
  "summary892",
  "summary892_unknown",
  "summary892_tax52",
  "summary892_conflict10",
  "summary892_conflictBoth",
] as const;

const seedCases: SeedCase[] = [
  { label: "createE2eReadyDraftForUser", seed: "ready" },
  { label: "createE2eTaxReviewDraftForUser default", seed: "taxReview" },
  ...(["unproven1003", "printed1003", "basis890", "basis890_264", ...summaryVariants] as const).map(
    (receiptCase) => ({
      label: `createE2eTaxReviewDraftForUser ${receiptCase}`,
      seed: "taxReview" as const,
      receiptCase,
    }),
  ),
  { label: "createE2eMixedTaxReviewDraftForUser", seed: "mixed" },
  { label: "createE2eTaxSummaryConflictDraftForUser", seed: "summaryConflict" },
  { label: "createE2eUnallocatedTaxDraftForUser", seed: "unallocated" },
];

async function seedGroup(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "seed conformance",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const categoryId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, categoryId };
  });
}

describe("E2E draft fixture conformance", () => {
  it.each(seedCases)("$label の保存理由は現在の stored 判定と一致する", async (seedCase) => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seedGroup(t);
    const args = { ...ids, createdByUserId: "seed-conformance-user" };
    const draftId = await (async () => {
      if (seedCase.seed === "ready")
        return await t.mutation(internal.aiExpenseDrafts.internal.createE2eReadyDraftForUser, args);
      if (seedCase.seed === "mixed")
        return await t.mutation(
          internal.aiExpenseDrafts.internal.createE2eMixedTaxReviewDraftForUser,
          args,
        );
      if (seedCase.seed === "summaryConflict")
        return await t.mutation(
          internal.aiExpenseDrafts.internal.createE2eTaxSummaryConflictDraftForUser,
          args,
        );
      if (seedCase.seed === "unallocated")
        return await t.mutation(
          internal.aiExpenseDrafts.internal.createE2eUnallocatedTaxDraftForUser,
          args,
        );
      return await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
        ...args,
        ...(seedCase.receiptCase ? { receiptCase: seedCase.receiptCase } : {}),
      });
    })();

    const { draft, items } = await t.run(async (ctx) => ({
      draft: await ctx.db.get(draftId),
      items: await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("draftId", draftId),
        )
        .order("asc")
        .collect(),
    }));
    expect(draft).not.toBeNull();
    const judgment = judgeDraftAmountAndTax(
      {
        ...draftDocToFields(draft!),
        items: items.map(draftItemDocToFields).map((item) => ({ ...item, _id: item.id })),
      },
      { inputKind: "stored" },
    );
    expect(draft!.reviewReasons).toEqual(judgment.reasons);
    expect(draft!.listSummary?.amountAndTaxResolved).toBe(judgment.status === "resolved");
  });
});
