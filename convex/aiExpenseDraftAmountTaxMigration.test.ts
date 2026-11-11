// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { convexTestModules } from "./test.setup";
import { mixedTaxReviewFixture } from "../lib/domain/aiExpenseDrafts/reviewTaxPreviewTestHelpers";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../lib/convex/aiExpenseDrafts/draftRecordMapping";
import { buildDraftListSummary } from "../lib/domain/aiExpenseDrafts/listSummary";
import { buildDraftRegistrationItems } from "../lib/domain/aiExpenseDrafts/registrationItems";

const dryRun = makeFunctionReference<"query">("aiExpenseDraftAmountTaxMigration:dryRun");
const execute = makeFunctionReference<"mutation">("aiExpenseDraftAmountTaxMigration:executeBatch");

describe("金額差異の移行", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("再計算額だけが一致する保存済み混在税では差異を外さない", async () => {
    const t = convexTest(schema, convexTestModules);
    const fixture = mixedTaxReviewFixture();
    const id = await t.run(async ({ db }) => {
      const groupId = await db.insert("groups", {
        name: "a",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await db.insert("categories", {
        groupId,
        name: "food",
        color: "#000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const draftId = await db.insert("aiExpenseDrafts", {
        groupId,
        status: "needs_review",
        sourceType: "image_upload",
        documentType: "receipt",
        shopName: "店",
        date: "2026-11-01",
        amountYen: 1782,
        categoryId,
        taxSummaries: fixture.draft.taxSummaries?.map((s) => ({ ...s, confidence: {} })),
        rawObservation: fixture.draft.rawObservation,
        reviewReasons: ["amount_mismatch"],
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
      for (const item of fixture.items)
        await db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: item.itemName,
          amountYen: Number(item.amountYen),
          printedAmountYen: item.printedAmountYen,
          amountBasis: item.amountBasis,
          taxRatePercent: item.taxRatePercent,
          taxResolutionStatus: item.taxResolutionStatus,
          taxResolutionSource: item.taxResolutionSource,
          categoryId,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        });
      return draftId;
    });
    const before = await t.run(async ({ db }) => ({
      draft: (await db.get(id))!,
      items: await db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", id))
        .collect(),
    }));
    const draft = draftDocToFields(before.draft);
    const items = before.items.map(draftItemDocToFields);
    expect(buildDraftListSummary(draft, items)).toMatchObject({
      amountAndTaxResolved: false,
      itemSummary: { itemDifferenceYen: 53 },
    });
    expect(() => buildDraftRegistrationItems(draft, items)).toThrow();
    expect(await t.mutation(execute, {})).toMatchObject({ updated: 0 });
    expect(await t.run(({ db }) => db.get(id))).toEqual(before.draft);
  });
  it("解決済みの理由だけを除去し、対象外・他グループ・未解決を守り冪等に実行する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async ({ db }) => {
      const group = await db.insert("groups", {
        name: "a",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const other = await db.insert("groups", {
        name: "b",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const category = await db.insert("categories", {
        groupId: group,
        name: "food",
        color: "#000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      async function draft(
        status: "ready" | "needs_review" | "registered",
        reasons: string[],
        total = 100,
        groupId = group,
      ) {
        const id = await db.insert("aiExpenseDrafts", {
          groupId,
          status,
          sourceType: "image_upload",
          documentType: "receipt",
          shopName: "店",
          date: "2026-11-01",
          amountYen: total,
          categoryId: category,
          confidence: {},
          reviewReasons: reasons,
          createdAt: 1,
          updatedAt: 1,
        });
        await db.insert("aiExpenseDraftItems", {
          groupId,
          draftId: id,
          itemName: "商品",
          amountYen: 100,
          categoryId: category,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        });
        return id;
      }
      const resolved = await draft("needs_review", ["amount_mismatch"]);
      await db.insert("aiExpenseDraftItems", {
        groupId: other,
        draftId: resolved,
        itemName: "別グループ",
        amountYen: 999,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
      return {
        resolved,
        otherReason: await draft("needs_review", ["amount_mismatch", "low_confidence"]),
        unresolved: await draft("needs_review", ["amount_mismatch"], 101),
        noReason: await draft("ready", [], 101),
        registered: await draft("registered", ["amount_mismatch"]),
        otherGroup: await draft("needs_review", ["amount_mismatch"], 100, other),
      };
    });
    const before = await t.run(async ({ db }) =>
      Promise.all(
        [
          ids.resolved,
          ids.otherReason,
          ids.unresolved,
          ids.noReason,
          ids.registered,
          ids.otherGroup,
        ].map((id) => db.get(id)),
      ),
    );
    const scan = await t.query(dryRun, {});
    expect(scan).toMatchObject({ isDone: true, needsUpdate: 3 });
    expect(
      await t.run(async ({ db }) =>
        Promise.all(
          [
            ids.resolved,
            ids.otherReason,
            ids.unresolved,
            ids.noReason,
            ids.registered,
            ids.otherGroup,
          ].map((id) => db.get(id)),
        ),
      ),
    ).toEqual(before);
    expect(await t.mutation(execute, {})).toMatchObject({ isDone: true, updated: 3 });
    const after = await t.run(async ({ db }) =>
      Promise.all(
        [
          ids.resolved,
          ids.otherReason,
          ids.unresolved,
          ids.noReason,
          ids.registered,
          ids.otherGroup,
        ].map((id) => db.get(id)),
      ),
    );
    expect(after[0]).toMatchObject({
      status: "ready",
      reviewReasons: [],
      listSummary: { amountAndTaxResolved: true, itemSummary: { itemDifferenceYen: 0 } },
      updatedAt: 1,
    });
    expect(after[1]).toMatchObject({ status: "needs_review", reviewReasons: ["low_confidence"] });
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
    expect(after[4]).toEqual(before[4]);
    expect(after[5]).toMatchObject({ status: "ready", reviewReasons: [] });
    expect(await t.mutation(execute, {})).toMatchObject({ updated: 0 });
  });
  it("25件ずつ cursor で処理する", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async ({ db }) => {
      const groupId = await db.insert("groups", {
        name: "a",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let i = 0; i < 26; i++) {
        const draftId = await db.insert("aiExpenseDrafts", {
          groupId,
          status: "needs_review",
          sourceType: "image_upload",
          documentType: "receipt",
          amountYen: 100,
          reviewReasons: ["amount_mismatch"],
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        });
        await db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: "商品",
          amountYen: 100,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });
    const first = await t.mutation(execute, {});
    expect(first).toMatchObject({ isDone: false, updated: 25 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const second = await t.mutation(execute, { cursor: first.continueCursor });
    expect(second).toMatchObject({ isDone: true, updated: 0 });
  });
});
