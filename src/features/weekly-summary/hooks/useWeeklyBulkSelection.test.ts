import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReceiptItem } from "../../summary-shared/types/types";
import { useWeeklyBulkSelection } from "./useWeeklyBulkSelection";

const receipt = (id: string): ReceiptItem => ({
  _id: id,
  date: "2026-06-15",
  shopName: `店${id}`,
  amountYen: 100,
  categoryId: "food",
  categoryName: "食費",
  categoryColor: "#f97316",
  recordType: "expenseEntry",
});

describe("useWeeklyBulkSelection", () => {
  it("週が変わると選択をクリアし、消えた行の選択も落とす", () => {
    const first = [receipt("a"), receipt("b")];
    const { result, rerender } = renderHook(
      ({ receipts, weekStartDate }: { receipts: ReceiptItem[]; weekStartDate: string }) =>
        useWeeklyBulkSelection(receipts, weekStartDate),
      { initialProps: { receipts: first, weekStartDate: "2026-06-15" } },
    );

    act(() => {
      result.current.toggleReceipt(first[0], true);
    });
    expect(result.current.selectedCount).toBe(1);

    rerender({ receipts: [first[1]], weekStartDate: "2026-06-15" });
    expect(result.current.selectedCount).toBe(0);

    act(() => {
      result.current.toggleReceipt(first[1], true);
    });
    rerender({ receipts: [first[1]], weekStartDate: "2026-06-22" });
    expect(result.current.selectedCount).toBe(0);
  });

  it("表示中の明細を上限まで選択する", () => {
    const receipts = [receipt("a"), receipt("b"), receipt("c")];
    const { result } = renderHook(() => useWeeklyBulkSelection(receipts, "2026-06-15"));

    act(() => {
      result.current.selectVisible(receipts);
    });
    expect(result.current.selectedIds.expenseEntryIds).toEqual(["a", "b", "c"]);
  });
});
