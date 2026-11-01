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
  normalizedAmountYen?: number;
  amountBasis?: "tax_included" | "tax_excluded" | "unknown";
  taxRatePercent?: 0 | 8 | 10 | null;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "unallocated" | "allocated";
  taxResolutionStatus?: "unresolved" | "resolved";
  taxResolutionSource?: "ai" | "user" | "inferred";
  taxReviewReasons?: string[];
  createdAt?: number;
  updatedAt?: number;
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
) => {
  const { createdAt = 1, updatedAt = 1, ...rest } = fields;
  return t.run(
    async (ctx) =>
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId,
        draftId,
        itemName: "品物",
        amountYen: 100,
        confidence: {},
        createdAt,
        updatedAt,
        ...rest,
      }),
  );
};

const valueSnapshot = (items: ItemCompatFields[]) => ({
  status: "ready" as const,
  documentType: "receipt" as const,
  confidence: {},
  warnings: [],
  reviewReasons: [],
  items: items.map((item) => ({
    itemName: "品物",
    amountYen: 100,
    confidence: {},
    ...item,
  })),
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

describe("deprecatedFieldCounts", () => {
  it("aiExpenseDraftItems の旧形式フィールドを件数だけ数える（空 markers + taxMarker を含む）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {});
    // markers 未設定 + taxMarker: `markers ?? [taxMarker]` fallback が効く旧行
    await insertItem(t, groupId, draftId, { taxMarker: "※" });
    // markers 空配列 + taxMarker: interpretReceiptTax の fallback だけが効く行
    await insertItem(t, groupId, draftId, {
      printedAmountYen: 100,
      lineType: "item",
      markers: [],
      taxMarker: "※",
    });
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

    const result = await t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, {});
    expect(result.isDone).toBe(true);
    expect(result.page).toEqual(result.totals);
    expect(result.totals).toMatchObject({
      scanned: 4,
      missingPrintedAmountYen: 1,
      missingLineType: 1,
      missingMarkers: 1,
      emptyMarkers: 2,
      markersAbsentOrEmptyWithTaxMarker: 2,
      withTaxMarker: 3,
    });
  });

  it("printedAmountYen 欠落行を分類する（追加調査候補は同値証明ではない）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {});
    // 何もない欠落行 → 追加調査候補
    await insertItem(t, groupId, draftId, {});
    // normalized 保持の欠落行（表示フォールバックで amountYen とズレうる）
    await insertItem(t, groupId, draftId, { normalizedAmountYen: 108 });
    // 税パイプラインフィールド保持の欠落行
    await insertItem(t, groupId, draftId, { amountBasis: "tax_excluded" });
    // 挿入後に更新痕跡のある欠落行（updatedAt は手がかりであり証明ではない）
    await insertItem(t, groupId, draftId, { createdAt: 1, updatedAt: 2 });
    // printedAmountYen あり → 分類対象外
    await insertItem(t, groupId, draftId, { printedAmountYen: 100, lineType: "item" });

    const result = await t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, {});
    expect(result.totals).toMatchObject({
      scanned: 5,
      missingPrintedAmountYen: 4,
      missingPrintedAmountYenWithNormalized: 1,
      missingPrintedAmountYenWithTaxFields: 1,
      missingPrintedAmountYenModifiedAfterInsert: 1,
      missingPrintedAmountYenInvestigationCandidates: 1,
    });
  });

  it("埋め込み snapshot の items には分類カウンタを適用しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ normalizedAmountYen: 108 }]),
      },
    });
    const result = await t.query(internal.deprecatedFieldCounts.aiExpenseDrafts, {});
    // 埋め込み items は missingPrintedAmountYen だけ数え、分類カウンタは持たない
    expect(result.totals.interpretation).toMatchObject({
      missingPrintedAmountYen: 1,
    });
    expect(result.totals.interpretation).not.toHaveProperty(
      "missingPrintedAmountYenInvestigationCandidates",
    );
  });

  it("aiExpenseDrafts の version・taxSummaryCorrections・埋め込み明細を数える", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const legacyItem = { taxMarker: "※" };
    const emptyMarkersWithTax = {
      printedAmountYen: 100,
      lineType: "item" as const,
      markers: [] as string[],
      taxMarker: "※",
    };
    const modernItem = {
      printedAmountYen: 100,
      lineType: "item" as const,
      markers: [] as string[],
    };
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
        values: valueSnapshot([legacyItem, emptyMarkersWithTax]),
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

    const result = await t.query(internal.deprecatedFieldCounts.aiExpenseDrafts, {});
    expect(result.totals).toMatchObject({
      scanned: 3,
      missingReceiptDataContractVersion: 2,
      withTaxSummaryCorrections: 1,
      interpretation: {
        missingPrintedAmountYen: 1,
        missingLineType: 1,
        missingMarkers: 1,
        emptyMarkers: 2,
        markersAbsentOrEmptyWithTaxMarker: 1,
        withTaxMarker: 1,
      },
      userOverride: {
        missingPrintedAmountYen: 1,
        missingLineType: 1,
        missingMarkers: 1,
        emptyMarkers: 1,
        markersAbsentOrEmptyWithTaxMarker: 2,
        withTaxMarker: 2,
      },
    });
  });

  it("carry に前回 totals を渡すと cursor をまたいで累計される", async () => {
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

    const first = await t.query(
      internal.deprecatedFieldCounts.groupDeletionAuditMigrationRecords,
      {},
    );
    expect(first.isDone).toBe(false);
    expect(first.page.scanned).toBe(25);
    const second = await t.query(
      internal.deprecatedFieldCounts.groupDeletionAuditMigrationRecords,
      { cursor: first.continueCursor ?? undefined, carry: first.totals },
    );
    expect(second.isDone).toBe(true);
    expect(second.totals).toMatchObject({
      scanned: 26,
      migrated: 24,
      skipped: 1,
      failed: 1,
    });
  });

  it("cursor と carry の片方だけの指定を拒否する（fail-closed）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {});
    await insertItem(t, groupId, draftId, { taxMarker: "※" });

    const first = await t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, {});
    // cursor だけの継続呼び出しは totals が最終 page だけになるため拒否する
    await expect(
      t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, {
        cursor: first.continueCursor ?? "dummy-cursor",
      }),
    ).rejects.toThrow("cursor と carry は両方指定するか両方省略すること");
    // 初回呼び出しに carry だけを渡すのも拒否する
    await expect(
      t.query(internal.deprecatedFieldCounts.aiExpenseDraftItems, {
        carry: first.totals,
      }),
    ).rejects.toThrow("cursor と carry は両方指定するか両方省略すること");
    await expect(
      t.query(internal.deprecatedFieldCounts.aiExpenseDrafts, {
        carry: {
          scanned: 1,
          missingReceiptDataContractVersion: 0,
          withTaxSummaryCorrections: 0,
          interpretation: {
            missingPrintedAmountYen: 0,
            missingLineType: 0,
            missingMarkers: 0,
            emptyMarkers: 0,
            markersAbsentOrEmptyWithTaxMarker: 0,
            withTaxMarker: 0,
          },
          userOverride: {
            missingPrintedAmountYen: 0,
            missingLineType: 0,
            missingMarkers: 0,
            emptyMarkers: 0,
            markersAbsentOrEmptyWithTaxMarker: 0,
            withTaxMarker: 0,
          },
        },
      }),
    ).rejects.toThrow("cursor と carry は両方指定するか両方省略すること");
    await expect(
      t.query(internal.deprecatedFieldCounts.groupDeletionAuditMigrationRecords, {
        cursor: "dummy-cursor",
      }),
    ).rejects.toThrow("cursor と carry は両方指定するか両方省略すること");
  });
});
