import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ReceiptItem } from "../types/types";
import { ReceiptListCard } from "./ReceiptListCard";

const receipts: ReceiptItem[] = Array.from({ length: 7 }, (_, index) => ({
  _id: `entry-${index}`,
  date: `2026-06-${String(21 - index).padStart(2, "0")}`,
  shopName: `店舗${index + 1}`,
  amountYen: 1_000 + index,
  categoryId: "food",
  categoryName: "食費",
  categoryColor: "#f97316",
  recordType: "expenseEntry",
}));

describe("ReceiptListCard", () => {
  it("初期表示を5件に制限し残件数を示して全件展開する", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceiptListCard count={7} isLoading={false} receipts={receipts} />);

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(5);
    const showMore = screen.getByRole("button", { name: "さらに2件を見る" });
    await user.click(showMore);

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "さらに2件を見る" })).not.toBeInTheDocument();
  });

  it("maxVisibleGroupsを指定すると初期表示件数を変えられる", () => {
    renderWithProviders(
      <ReceiptListCard
        count={7}
        isLoading={false}
        maxVisibleGroups={Number.POSITIVE_INFINITY}
        receipts={receipts}
      />,
    );

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: /さらに/ })).not.toBeInTheDocument();
  });

  it("読込中は既存データの全件展開ボタンを表示しない", () => {
    renderWithProviders(<ReceiptListCard count={7} isLoading receipts={receipts} />);

    expect(screen.queryByRole("button", { name: "さらに2件を見る" })).not.toBeInTheDocument();
  });

  it("PC一覧用の列見出しを提供する", () => {
    renderWithProviders(
      <ReceiptListCard count={1} isLoading={false} receipts={receipts.slice(0, 1)} />,
    );

    for (const label of ["日付", "店名・内訳", "金額（円）", "メモ", "操作"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("カテゴリ")).not.toBeInTheDocument();
  });

  it("同じレシートの明細を店舗ごとにまとめ、明細のカテゴリーを表示する", () => {
    const groupedReceipts: ReceiptItem[] = [
      {
        ...receipts[0],
        _id: "item-food",
        itemName: "食料品",
        receiptGroupId: "sourceDocument-1",
        receiptShopName: "スーパー北浜",
        receiptTotalAmountYen: 3000,
        categoryName: "食費",
      },
      {
        ...receipts[0],
        _id: "item-daily",
        itemName: "洗剤",
        receiptGroupId: "sourceDocument-1",
        receiptShopName: "スーパー北浜",
        receiptTotalAmountYen: 3000,
        categoryName: "日用品",
      },
    ];

    renderWithProviders(<ReceiptListCard count={2} isLoading={false} receipts={groupedReceipts} />);

    expect(screen.getByText("支出一覧（1件）")).toBeInTheDocument();
    expect(screen.getByText("スーパー北浜")).toBeInTheDocument();
    expect(screen.getByText("内訳: 食料品、洗剤")).toBeInTheDocument();
    expect(screen.getByText("食料品")).toBeInTheDocument();
    expect(screen.getByText("洗剤")).toBeInTheDocument();
    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(screen.getByText("日用品")).toBeInTheDocument();
    expect(screen.getByText("3,000円")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-group")).toBeInTheDocument();
  });

  it("内訳のない単一支出は従来どおりカテゴリー付きで1行表示する", () => {
    renderWithProviders(
      <ReceiptListCard count={1} isLoading={false} receipts={receipts.slice(0, 1)} />,
    );

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(1);
    expect(screen.queryByTestId("receipt-group")).not.toBeInTheDocument();
    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(screen.getByText("店舗1")).toBeInTheDocument();
  });

  it("選択UIはopt-inで、選択中だけ一括操作を出す", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    const onBulkChangeCategory = vi.fn();

    const { rerender } = renderWithProviders(
      <ReceiptListCard count={1} isLoading={false} receipts={receipts.slice(0, 1)} />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "カテゴリを変更" })).not.toBeInTheDocument();

    rerender(
      <ReceiptListCard
        count={1}
        isLoading={false}
        receipts={receipts.slice(0, 1)}
        selectedCount={1}
        selectionEnabled
        isSelected={() => true}
        onBulkChangeCategory={onBulkChangeCategory}
        onToggleSelection={onToggleSelection}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /店舗1.*を選択/ })).toBeInTheDocument();
    expect(screen.getByText("明細1件を選択中")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "カテゴリを変更" }));
    expect(onBulkChangeCategory).toHaveBeenCalledTimes(1);
  });

  it("同じ日付では後から取得した支出を先に表示する", () => {
    const sameDayReceipts = receipts.map((receipt) => ({ ...receipt, date: "2026-06-21" }));
    renderWithProviders(<ReceiptListCard count={7} isLoading={false} receipts={sameDayReceipts} />);

    expect(screen.getByText("店舗7")).toBeInTheDocument();
    expect(screen.getByText("店舗3")).toBeInTheDocument();
    expect(screen.queryByText("店舗2")).not.toBeInTheDocument();
    expect(screen.queryByText("店舗1")).not.toBeInTheDocument();
  });
});
