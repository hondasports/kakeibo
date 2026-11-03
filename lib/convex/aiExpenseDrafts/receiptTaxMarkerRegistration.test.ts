// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { convexTestModules } from "../../../convex/test.setup";

const userId = "tax-marker-test";
const identity = { tokenIdentifier: userId, subject: userId, issuer: "https://issuer.example" };

describe("軽減税率注記の保存と登録", () => {
  it.each([false, true])(
    "保存後の再取得と登録で印字税額の矛盾を保護する（矛盾=%s）",
    async (conflict) => {
      const t = convexTest(schema, convexTestModules);
      const { draftId, categoryId } = await t.run(async ({ db }) => {
        const groupId = await db.insert("groups", {
          name: "test",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        await db.insert("users", {
          userId,
          displayName: "test",
          activeGroupId: groupId,
          createdAt: 1,
          updatedAt: 1,
        });
        await db.insert("groupMembers", {
          groupId,
          userId,
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        });
        const categoryId = await db.insert("categories", {
          groupId,
          name: "食費",
          color: "#f97316",
          isActive: true,
          sortOrder: 0,
          createdAt: 1,
          updatedAt: 1,
        });
        const line = (rawText: string, amountYen: number | null, sourceLineIndex: number) => ({
          rawText,
          amountYen,
          amountText: amountYen === null ? null : String(amountYen),
          sourceLineIndex,
          explicitlyPrinted: true,
          lineRoleCandidates: ["unknown" as const],
          roleConfidence: 1,
        });
        const draftId = await db.insert("aiExpenseDrafts", {
          groupId,
          sourceType: "image_upload",
          status: "needs_review",
          documentType: "receipt",
          shopName: "匿名",
          date: "2026-09-10",
          amountYen: 265,
          categoryId,
          registrationMode: "detailed",
          confidence: {},
          reviewReasons: [],
          createdAt: 1,
          updatedAt: 1,
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "external",
              taxableAmountBasis: "tax_excluded",
              taxableAmountYen: 246,
              taxYen: 19,
              roundingMethod: "floor",
              confidence: {},
              warnings: [],
              status: "contradictory",
            },
          ],
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              line("8%対象額 246円", 246, 0),
              line(conflict ? "外税8% 20円" : "外税8% 19円", conflict ? 20 : 19, 1),
              line("合計 265円", 265, 2),
              line("※印は軽減税率対象商品です。", null, 3),
            ],
          },
        });
        for (const amount of [108, 138])
          await db.insert("aiExpenseDraftItems", {
            groupId,
            draftId,
            itemName: `商品${amount}`,
            amountYen: amount,
            printedAmountYen: amount,
            amountBasis: "tax_excluded",
            taxRatePercent: 8,
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            taxAllocationStatus: "unallocated",
            categoryId,
            confidence: {},
            createdAt: 1,
            updatedAt: 1,
          });
        return { draftId, categoryId };
      });
      const client = t.withIdentity(identity);
      await client.mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        draftId,
        documentType: "receipt",
        shopName: "匿名",
        date: "2026-09-10",
        amountYen: 265,
        categoryId,
      });
      const retrieved = await client.query(api.aiExpenseDrafts.queries.getWithItems, { draftId });
      expect(retrieved).toBeTruthy();
      if (conflict) {
        expect(retrieved?.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(
          true,
        );
        await expect(
          client.mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
            draftIds: [draftId],
          }),
        ).rejects.toThrow();
      } else {
        expect(retrieved?.draft.taxSummaries).toMatchObject([
          { taxRatePercent: 8, taxableAmountYen: 246, taxYen: 19, status: "verified" },
        ]);
        expect(
          retrieved?.items
            .map((item) => item.normalizedAmountYen)
            .sort((a, b) => (a ?? 0) - (b ?? 0)),
        ).toEqual([116, 149]);
        expect(retrieved?.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(
          true,
        );
        const result = await client.mutation(
          api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries,
          { draftIds: [draftId] },
        );
        expect(result.registeredDraftIds).toEqual([draftId]);
        const entries = await t.run(async ({ db }) =>
          Promise.all(result.createdExpenseEntryIds.map((id) => db.get(id))),
        );
        expect(entries.reduce((sum, item) => sum + (item?.amount ?? 0), 0)).toBe(265);
      }
    },
  );
});
