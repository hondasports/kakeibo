// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

type ItemCompatFields = {
  printedAmountYen?: number;
  lineType?: "item" | "discount" | "promotion_adjustment" | "unknown";
  markers?: string[];
  taxMarker?: string;
};

type DraftCompatFields = Partial<
  Pick<
    Doc<"aiExpenseDrafts">,
    "receiptInterpretation" | "receiptUserOverride" | "receiptDataContractVersion"
  >
>;

const insertGroup = (t: ReturnType<typeof convexTest>) =>
  t.run(
    async (ctx) =>
      await ctx.db.insert("groups", {
        name: "家計",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
  );

const insertItem = (
  t: ReturnType<typeof convexTest>,
  groupId: Id<"groups">,
  draftId: Id<"aiExpenseDrafts">,
  fields: ItemCompatFields,
) =>
  t.run(
    async (ctx) =>
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId,
        draftId,
        itemName: "品物",
        amountYen: 100,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      }),
  );

const valueSnapshot = (items: ItemCompatFields[]) => ({
  status: "ready" as const,
  documentType: "receipt" as const,
  confidence: {},
  warnings: [],
  reviewReasons: [],
  items: items.map((item) => ({ itemName: "品物", amountYen: 100, confidence: {}, ...item })),
});

const taxSummary = {
  taxRatePercent: 10 as const,
  taxMode: "included" as const,
  taxableAmountYen: 1000,
  taxableAmountBasis: "tax_included" as const,
  taxYen: 100,
  roundingMethod: "floor" as const,
  confidence: {},
  warnings: [],
};

const insertDraft = (
  t: ReturnType<typeof convexTest>,
  groupId: Id<"groups">,
  fields: DraftCompatFields,
) =>
  t.run(
    async (ctx) =>
      await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        confidence: {},
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      }),
  );

const collectPages = async <T extends { isDone: boolean; continueCursor: string | null }>(
  run: (cursor?: string) => Promise<T>,
) => {
  const pages: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await run(cursor);
    pages.push(page);
    if (page.isDone) return pages;
    cursor = page.continueCursor ?? undefined;
  }
};

const sumField = <K extends string>(pages: Record<K, number>[], key: K) =>
  pages.reduce((acc, page) => acc + page[key], 0);

describe("deprecatedFieldCounts", () => {
  it("aiExpenseDraftItems の旧形式フィールドを件数だけ数える", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {});
    await insertItem(t, groupId, draftId, { taxMarker: "※" });
    await insertItem(t, groupId, draftId, {
      printedAmountYen: 100,
      lineType: "item",
      markers: ["※"],
      taxMarker: "※",
    });
    await insertItem(t, groupId, draftId, {
      printedAmountYen: 200,
      lineType: "item",
      markers: [],
    });

    const pages = await collectPages((cursor) =>
      t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, { cursor }),
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      scanned: 3,
      missingPrintedAmountYen: 1,
      missingLineType: 1,
      missingMarkers: 1,
      missingMarkersWithTaxMarker: 1,
      withTaxMarker: 2,
    });
  });

  it("aiExpenseDrafts の version・taxSummaryCorrections・埋め込み明細を数える", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const legacyItem = { taxMarker: "※" };
    const modernItem = { printedAmountYen: 100, lineType: "item", markers: [] as string[] };
    await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([legacyItem, modernItem]),
      },
      receiptUserOverride: {
        source: "user",
        updatedAt: 1,
        fields: ["amountYen"],
        taxSummaryCorrections: [taxSummary],
        values: valueSnapshot([legacyItem]),
      },
    });
    await insertDraft(t, groupId, {
      receiptDataContractVersion: 1,
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([modernItem]),
      },
      receiptUserOverride: {
        source: "user",
        updatedAt: 1,
        fields: [],
        values: valueSnapshot([]),
      },
    });
    await insertDraft(t, groupId, {});

    const pages = await collectPages((cursor) =>
      t.query(internal.deprecatedFieldCounts.aiExpenseDrafts, { cursor }),
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      scanned: 3,
      missingReceiptDataContractVersion: 2,
      withTaxSummaryCorrections: 1,
      interpretation: {
        missingPrintedAmountYen: 1,
        missingLineType: 1,
        missingMarkers: 1,
        missingMarkersWithTaxMarker: 1,
      },
      userOverride: {
        missingPrintedAmountYen: 1,
        missingLineType: 1,
        missingMarkers: 1,
        missingMarkersWithTaxMarker: 1,
      },
    });
  });

  it("groupDeletionAuditMigrationRecords を status 別に数え、cursor で継続する", async () => {
    const t = convexTest(schema, convexTestModules);
    const counts = {
      receiptAnalysisImageJobs: 0,
      aiExpenseDraftItems: 0,
      aiExpenseDrafts: 0,
      receiptAnalysisBatches: 0,
      expenseEntries: 0,
      receipts: 0,
      sourceDocuments: 0,
      storageFiles: 0,
      weekSessions: 0,
      categories: 0,
      groupInvitations: 0,
      managementAuditLogs: 0,
      groupMembers: 0,
      groups: 1,
    };
    const statuses = [
      ...Array.from({ length: 24 }, () => "migrated" as const),
      "skipped" as const,
      "failed" as const,
    ];
    for (const [index, status] of statuses.entries()) {
      await t.run(async (ctx) => {
        await ctx.db.insert("groupDeletionAuditMigrationRecords", {
          recordKind: "legacy_audit",
          legacyAuditId: `audit-${index}`,
          actorUserIdSnapshot: "issuer|actor",
          targetGroupIdSnapshot: `group-${index}`,
          deletedCounts: counts,
          sourceCreatedAt: 1,
          status,
          createdAt: 1,
          updatedAt: 1,
        });
      });
    }

    const pages = await collectPages((cursor) =>
      t.query(internal.deprecatedFieldCounts.groupDeletionAuditMigrationRecords, {
        cursor,
      }),
    );
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(sumField(pages, "scanned")).toBe(26);
    expect(sumField(pages, "migrated")).toBe(24);
    expect(sumField(pages, "skipped")).toBe(1);
    expect(sumField(pages, "failed")).toBe(1);
  });
});
