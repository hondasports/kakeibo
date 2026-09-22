import { expect } from "vitest";
import type { CategoryLike } from "../categories/candidate";
import { mapExtractionToDraftArgs } from "./extractionMapping";
import { trialExternal8Fixture } from "../../convex/receiptImageExtraction/fixtures/taxFixtures";
import type { ReceiptRawObservationLine } from "../receipt/observations";

export const foodCategory: CategoryLike<string> = {
  _id: "cat-food",
  name: "食費",
};

export const categories = ["食費", "衣服", "その他", "医療"].map((name) => ({ _id: name, name }));
export const item = (itemName: string, amount: number) => ({
  ...trialExternal8Fixture.items![0],
  itemName,
  amountYen: amount,
  printedAmountYen: amount,
  amountBasis: "unknown" as const,
  taxRatePercent: null,
  markers: [],
  taxMarker: "",
  categoryName: "食費",
  lineType: "unknown" as const,
});
export type Row = [string, number | null, string?, ("item" | "tax" | "subtotal" | "unknown")?];
export function observations(rows: Row[]): ReceiptRawObservationLine[] {
  return rows.map(([rawText, amountYen, amountText, role], sourceLineIndex) => ({
    rawText,
    amountYen,
    amountText: amountText ?? null,
    lineRoleCandidates: [role ?? "item"],
    roleConfidence: 0.99,
    explicitlyPrinted: true,
    sourceLineIndex,
  }));
}
export function map(items: ReturnType<typeof item>[], rows: Row[], total: number) {
  return mapExtractionToDraftArgs(
    {
      ...trialExternal8Fixture,
      items,
      taxSummaries: [],
      amountYen: total,
      rawObservations: observations(rows),
    },
    categories,
  );
}
export function check(result: ReturnType<typeof map>, count: number, total: number) {
  expect(result.items).toHaveLength(count);
  expect(result.items!.reduce((sum, i) => sum + i.amountYen, 0)).toBe(total);
  expect(result.reviewReasons ?? []).not.toContain("amount_mismatch");
  expect(result.amountYen).toBe(total);
  expect(result.items!.every((i) => i.taxResolutionStatus === "resolved")).toBe(true);
}
