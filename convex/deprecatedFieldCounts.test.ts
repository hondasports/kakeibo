// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";
import { classifyJoinEvidence } from "./deprecatedFieldCounts";

type ItemCompatFields = {
  itemName?: string;
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
  items: items.map(({ itemName, ...item }) => ({
    itemName: itemName ?? "品物",
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
      taxSummaryCorrectionsPresent: 1,
      taxSummaryCorrectionsPresentEmpty: 0,
      interpretationSourceAi: 2,
      interpretationSourceLegacyProjection: 0,
      interpretationAbsent: 1,
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
          taxSummaryCorrectionsPresent: 0,
          taxSummaryCorrectionsPresentEmpty: 0,
          interpretationSourceAi: 0,
          interpretationSourceLegacyProjection: 0,
          interpretationAbsent: 0,
          interpretationMalformed: 0,
          userOverrideMalformed: 0,
          interpretation: {
            scanned: 0,
            missingPrintedAmountYen: 0,
            missingLineType: 0,
            missingMarkers: 0,
            emptyMarkers: 0,
            markersAbsentOrEmptyWithTaxMarker: 0,
            withTaxMarker: 0,
          },
          userOverride: {
            scanned: 0,
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

  it("printedAmountJoinEvidence が欠落行を親 snapshot との突合で分類する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    // ai snapshot: 一意名一致 + index 一致 + printed === amountYen（整合信号。証明ではない）
    const d1 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "A", printedAmountYen: 100 }]),
      },
    });
    await insertItem(t, groupId, d1, { itemName: "A", amountYen: 100, createdAt: 100 });
    // ai snapshot: printed !== amountYen（不整合）
    const d2 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "B", printedAmountYen: 80 }]),
      },
    });
    await insertItem(t, groupId, d2, { itemName: "B", amountYen: 100, createdAt: 200 });
    // ai snapshot: embedded printed 欠落
    const d3 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "C" }]),
      },
    });
    await insertItem(t, groupId, d3, { itemName: "C", createdAt: 200 });
    // ai snapshot: 同名なし（編集で改名した可能性。不明）
    const d4 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "X", printedAmountYen: 1 }]),
      },
    });
    await insertItem(t, groupId, d4, { itemName: "D", createdAt: 200 });
    // ai snapshot: 同名複数 + 件数不一致（一意特定不能）
    const d5 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([
          { itemName: "E", printedAmountYen: 1 },
          { itemName: "E", printedAmountYen: 2 },
        ]),
      },
    });
    await insertItem(t, groupId, d5, { itemName: "E", createdAt: 200 });
    // legacy_projection はテーブル再投影（循環）で証拠にならない
    const d6 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "legacy_projection",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "F", printedAmountYen: 100 }]),
      },
    });
    await insertItem(t, groupId, d6, { itemName: "F", createdAt: 200 });
    // snapshot なし
    const d7 = await insertDraft(t, groupId, {});
    await insertItem(t, groupId, d7, { itemName: "G", createdAt: 200 });
    // ai snapshot + userOverride 併存（副次フラグ）
    const d8 = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "H", printedAmountYen: 100 }]),
      },
      receiptUserOverride: {
        source: "user",
        updatedAt: 1,
        fields: ["amountYen"],
        values: valueSnapshot([{ itemName: "H", printedAmountYen: 100 }]),
      },
    });
    await insertItem(t, groupId, d8, { itemName: "H", amountYen: 100, createdAt: 200 });
    // ai snapshot: 兄弟行側に同名が2行 → 埋め込み側が1件でも曖昧（両行が同じ
    // snapshot item に uniqueNameJoin 判定されるのを防ぐ）
    const d5b = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "E2", printedAmountYen: 100 }]),
      },
    });
    await insertItem(t, groupId, d5b, { itemName: "E2", amountYen: 100, createdAt: 200 });
    await insertItem(t, groupId, d5b, { itemName: "E2", amountYen: 200, createdAt: 200 });
    // 親 draft が別 group → 参照先を信用できない（不明扱い）
    const groupId2 = await insertGroup(t);
    const d10 = await insertDraft(t, groupId2, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "J", printedAmountYen: 100 }]),
      },
    });
    await insertItem(t, groupId, d10, { itemName: "J", amountYen: 100, createdAt: 200 });
    // 親 draft 削除済み → 孤児
    const d9 = await insertDraft(t, groupId, {});
    const orphan = await insertItem(t, groupId, d9, { itemName: "I", createdAt: 200 });
    await t.run(async (ctx) => ctx.db.delete(d9));
    expect(orphan).toBeDefined();
    // printedAmountYen 保持行は分類対象外
    await insertItem(t, groupId, d1, { itemName: "skip", printedAmountYen: 100, createdAt: 200 });

    const result = await t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
      deployWindowStartTs: 150,
      deployWindowEndTs: 160,
    });
    expect(result.isDone).toBe(true);
    expect(result.totals).toMatchObject({
      scanned: 13,
      missingPrintedRows: 12,
      createdAtBeforeDeployWindowStart: 1,
      createdAtInDeployWindow: 0,
      createdAtAtOrAfterDeployWindowEnd: 11,
      parentDraftMissing: 1,
      parentDraftGroupMismatch: 1,
      hasUserOverride: 1,
      interpretationAbsent: 1,
      interpretationNonAi: 1,
      interpretationItemsMalformed: 0,
      siblingsTruncated: 0,
      rowMissingFromSiblingIndex: 0,
      // d5b は同名2行それぞれが計上、d5・d1（"skip" 行が sibling にいる）で各1件
      siblingCountDiffers: 4,
      ambiguousNameJoinTableSide: 2,
      noNameOverlap: 1,
      ambiguousNameJoin: 1,
      uniqueNameJoinEmbeddedPrintedMissing: 1,
      uniqueNameJoinPrintedEqualsAmount: 2,
      uniqueNameJoinPrintedDiffers: 1,
      uniqueNameJoinPositionConsistent: 4,
    });
  });

  it("classifyJoinEvidence は malformed 埋め込み・group 不一致・位置欠落を「不明」に分類する", () => {
    const item = {
      _id: "row1",
      groupId: "g1",
      draftId: "d1",
      itemName: "A",
      amountYen: 100,
      createdAt: 1,
    };
    const siblings = [{ _id: "row1", itemName: "A" }];
    const counts = () => ({
      scanned: 0,
      missingPrintedRows: 0,
      createdAtBeforeDeployWindowStart: 0,
      createdAtInDeployWindow: 0,
      createdAtAtOrAfterDeployWindowEnd: 0,
      parentDraftMissing: 0,
      parentDraftGroupMismatch: 0,
      hasUserOverride: 0,
      interpretationAbsent: 0,
      interpretationNonAi: 0,
      interpretationItemsMalformed: 0,
      siblingsTruncated: 0,
      rowMissingFromSiblingIndex: 0,
      siblingCountDiffers: 0,
      ambiguousNameJoinTableSide: 0,
      noNameOverlap: 0,
      ambiguousNameJoin: 0,
      uniqueNameJoinEmbeddedPrintedMissing: 0,
      uniqueNameJoinPrintedEqualsAmount: 0,
      uniqueNameJoinPrintedDiffers: 0,
      uniqueNameJoinPositionConsistent: 0,
    });
    const run = (
      draft: Parameters<typeof classifyJoinEvidence>[1],
      sibs: Parameters<typeof classifyJoinEvidence>[2] = siblings,
    ) => {
      const c = counts();
      classifyJoinEvidence(item, draft, sibs, undefined, undefined, c);
      return c;
    };
    const aiDraft = (items: unknown) => ({
      groupId: "g1",
      receiptInterpretation: { source: "ai", values: { items } },
    });
    // items 非配列・要素非オブジェクト・itemName 非文字列 → malformed
    expect(run(aiDraft({ not: "array" })).interpretationItemsMalformed).toBe(1);
    expect(run(aiDraft([1, 2])).interpretationItemsMalformed).toBe(1);
    expect(run(aiDraft([{ itemName: 5 }])).interpretationItemsMalformed).toBe(1);
    expect(run(aiDraft([{ itemName: undefined }])).interpretationItemsMalformed).toBe(1);
    // group 不一致は interpretation の内容に関わらず不明扱い
    expect(
      run({
        groupId: "g2",
        receiptInterpretation: { source: "ai", values: { items: [] } },
      }).parentDraftGroupMismatch,
    ).toBe(1);
    // index 結果に自分が居ない → 位置判定不能として join しない
    expect(
      run(aiDraft([{ itemName: "A", printedAmountYen: 100 }]), [{ _id: "other", itemName: "A" }])
        .rowMissingFromSiblingIndex,
    ).toBe(1);
    // 兄弟側同名2行 → 埋め込み1件でも曖昧
    const dupCounts = counts();
    classifyJoinEvidence(
      item,
      aiDraft([{ itemName: "A", printedAmountYen: 100 }]),
      [
        { _id: "row1", itemName: "A" },
        { _id: "row2", itemName: "A" },
      ],
      undefined,
      undefined,
      dupCounts,
    );
    expect(dupCounts.ambiguousNameJoinTableSide).toBe(1);
    expect(dupCounts.uniqueNameJoinPrintedEqualsAmount).toBe(0);
    // 日付バケット: 窓内は「deploy 前後どちらとも不明」で独立計上。
    // endTs 省略は空窓（start 以降は全て atOrAfterEnd）。
    const dateOf = (createdAt: number, start?: number, end?: number) => {
      const c = counts();
      classifyJoinEvidence({ ...item, createdAt }, aiDraft([]), siblings, start, end, c);
      return c;
    };
    expect(dateOf(149, 150, 160).createdAtBeforeDeployWindowStart).toBe(1);
    expect(dateOf(155, 150, 160).createdAtInDeployWindow).toBe(1);
    expect(dateOf(160, 150, 160).createdAtAtOrAfterDeployWindowEnd).toBe(1);
    expect(dateOf(200, 150).createdAtAtOrAfterDeployWindowEnd).toBe(1);
    expect(dateOf(200, 150).createdAtInDeployWindow).toBe(0);
    const noWindow = dateOf(200);
    expect(noWindow.createdAtBeforeDeployWindowStart).toBe(0);
    expect(noWindow.createdAtInDeployWindow).toBe(0);
    expect(noWindow.createdAtAtOrAfterDeployWindowEnd).toBe(0);
  });

  it("printedAmountJoinEvidence は sibling 上限超過を truncated として join しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {
      receiptInterpretation: {
        source: "ai",
        interpretedAt: 1,
        values: valueSnapshot([{ itemName: "T", printedAmountYen: 100 }]),
      },
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i += 1) {
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: i === 0 ? "T" : `品物${i}`,
          amountYen: 100,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });
    // BATCH_SIZE=25 を超えるため carry で継続しながら全ページを走査する
    let result = await t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {});
    let totals = result.totals;
    while (!result.isDone) {
      result = await t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        cursor: result.continueCursor ?? undefined,
        carry: { counts: totals },
      });
      totals = result.totals;
    }
    expect(totals).toMatchObject({
      missingPrintedRows: 101,
      siblingsTruncated: 101,
      // 打ち切った行は join に進まない（uniqueNameJoin* は増えない）
      uniqueNameJoinPrintedEqualsAmount: 0,
      uniqueNameJoinPositionConsistent: 0,
      siblingCountDiffers: 0,
    });
  });

  it("printedAmountJoinEvidence は継続ページで deployWindow の変化を拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await insertGroup(t);
    const draftId = await insertDraft(t, groupId, {});
    for (let i = 0; i < 26; i += 1) {
      await insertItem(t, groupId, draftId, { createdAt: 100 });
    }
    const first = await t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
      deployWindowStartTs: 150,
      deployWindowEndTs: 160,
    });
    expect(first.isDone).toBe(false);
    // 同一の窓境界で継続 → OK
    const second = await t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
      cursor: first.continueCursor ?? undefined,
      carry: {
        counts: first.totals,
        deployWindowStartTs: 150,
        deployWindowEndTs: 160,
      },
      deployWindowStartTs: 150,
      deployWindowEndTs: 160,
    });
    expect(second.isDone).toBe(true);
    expect(second.totals.missingPrintedRows).toBe(26);
    expect(second.totals.createdAtBeforeDeployWindowStart).toBe(26);
    // 異なる start で継続 → 拒否（日付バケットの累計混入を防ぐ）。
    // end < start の無効ペアは引数検証が先に落とすため、有効ペアでずらす。
    await expect(
      t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        cursor: first.continueCursor ?? undefined,
        carry: {
          counts: first.totals,
          deployWindowStartTs: 150,
          deployWindowEndTs: 160,
        },
        deployWindowStartTs: 999,
        deployWindowEndTs: 1000,
      }),
    ).rejects.toThrow("deployWindow の境界が変わっています");
    // 異なる end で継続 → 拒否
    await expect(
      t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        cursor: first.continueCursor ?? undefined,
        carry: {
          counts: first.totals,
          deployWindowStartTs: 150,
          deployWindowEndTs: 160,
        },
        deployWindowStartTs: 150,
        deployWindowEndTs: 999,
      }),
    ).rejects.toThrow("deployWindow の境界が変わっています");
    // 窓なしで開始した carry を窓ありで継続するのも拒否
    const firstNoCutoff = await t.query(
      internal.deprecatedFieldCounts.printedAmountJoinEvidence,
      {},
    );
    await expect(
      t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        cursor: firstNoCutoff.continueCursor ?? undefined,
        carry: { counts: firstNoCutoff.totals },
        deployWindowStartTs: 150,
      }),
    ).rejects.toThrow("deployWindow の境界が変わっています");
    // end 単独・end < start は初回呼び出し時点で拒否
    await expect(
      t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        deployWindowEndTs: 160,
      }),
    ).rejects.toThrow("deployWindowStartTs と同時に");
    await expect(
      t.query(internal.deprecatedFieldCounts.printedAmountJoinEvidence, {
        deployWindowStartTs: 200,
        deployWindowEndTs: 160,
      }),
    ).rejects.toThrow("deployWindowStartTs と同時に");
  });
});
