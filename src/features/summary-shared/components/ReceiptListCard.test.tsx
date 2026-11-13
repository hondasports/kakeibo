import { screen, within } from "@testing-library/react";
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

    for (const label of ["日付", "店名・内訳", "金額（円）", "操作"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "メモ" })).not.toBeInTheDocument();
    expect(screen.queryByText("カテゴリ")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "見出しと親行・明細行のセル数が一致する（選択可能: %s）",
    (selectionEnabled) => {
      const item = { ...receipts[0], itemName: "牛乳", receiptTotalAmountYen: 1200 };
      renderWithProviders(
        <ReceiptListCard
          count={1}
          isLoading={false}
          receipts={[item]}
          selectionEnabled={selectionEnabled}
        />,
      );
      const table = screen.getByRole("table");
      const rows = within(table).getAllByRole("row");
      const columns = within(rows[0]).getAllByRole("columnheader").length;
      for (const row of rows.slice(1)) {
        expect(within(row).getAllByRole("cell", { hidden: true })).toHaveLength(columns);
      }
    },
  );

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
    expect(screen.queryByText(/内訳:/)).not.toBeInTheDocument();
    expect(screen.getByTitle("食料品")).toBeInTheDocument();
    expect(screen.getByTitle("洗剤")).toBeInTheDocument();
    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(screen.getByText("日用品")).toBeInTheDocument();
    expect(screen.getAllByTestId("receipt-row")).toHaveLength(2);
    expect(screen.getByText("3,000円")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-group")).toBeInTheDocument();
  });

  it("金額が一致する単一明細を1行にまとめて明細を操作する", async () => {
    const user = userEvent.setup();
    const item = {
      ...receipts[0],
      type: "expense" as const,
      itemName: "長い品名、牛乳、パン",
      receiptShopName: "スーパー北浜",
      receiptTotalAmountYen: 1000,
    };
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleSelection = vi.fn();
    renderWithProviders(
      <ReceiptListCard
        count={1}
        isLoading={false}
        receipts={[item]}
        selectionEnabled
        onEditReceipt={onEdit}
        onDeleteReceipt={onDelete}
        onToggleSelection={onToggleSelection}
      />,
    );
    expect(screen.getAllByTestId("receipt-row")).toHaveLength(1);
    expect(within(screen.getByTestId("receipt-row")).getAllByRole("cell")).toHaveLength(5);
    expect(screen.getByText("スーパー北浜")).toBeInTheDocument();
    expect(screen.getByTitle(item.itemName)).toHaveTextContent(item.itemName);
    expect(screen.getAllByText("1,000円")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "スーパー北浜（6/21）を編集" }));
    await user.click(screen.getByRole("button", { name: "スーパー北浜（6/21）を削除" }));
    await user.click(screen.getByRole("checkbox", { name: "スーパー北浜（6/21）を選択" }));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);
    expect(onToggleSelection).toHaveBeenCalledWith(item, true);
  });

  it.each([1000, 1200])(
    "合計だけで保存した行は店名とChipを折り返し可能な領域に置く（合計: %s）",
    (total) => {
      const item = {
        ...receipts[0],
        itemName: "牛乳",
        receiptShopName: "長い店舗名",
        receiptTotalAmountYen: total,
        registrationMode: "totalOnly" as const,
      };
      renderWithProviders(
        <ReceiptListCard count={1} isLoading={false} receipts={[item]} selectionEnabled />,
      );
      const identity = screen.getByText("長い店舗名").closest(".receipt-row-identity");
      expect(identity).toContainElement(screen.getByText("合計だけで保存"));
      expect(identity).toContainElement(screen.getByText("支出"));
      expect(identity?.closest('[role="cell"]')).toBeInTheDocument();
    },
  );

  it("店名と同じ品名の単一明細は重複表示せず、メモと操作を残す", () => {
    const item = {
      ...receipts[0],
      shopName: "スーパー北浜",
      itemName: "  スーパー北浜  ",
      receiptShopName: "スーパー北浜",
      receiptTotalAmountYen: 1000,
      memo: "メモ本文",
    };
    renderWithProviders(
      <ReceiptListCard
        count={1}
        isLoading={false}
        receipts={[item]}
        selectionEnabled
        onEditReceipt={vi.fn()}
        onDeleteReceipt={vi.fn()}
        onToggleSelection={vi.fn()}
      />,
    );
    expect(screen.getAllByText("スーパー北浜")).toHaveLength(1);
    expect(screen.queryByTestId("item-expandable-text")).not.toBeInTheDocument();
    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(screen.getByTestId("memo-expandable-content")).toHaveTextContent("メモ本文");
    expect(screen.getByRole("button", { name: "スーパー北浜（6/21）を編集" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "スーパー北浜（6/21）を削除" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "スーパー北浜（6/21）を選択" }),
    ).toBeInTheDocument();
  });

  it("店名と同じ品名でも金額が異なれば明細行に表示する", () => {
    const item = { ...receipts[0], itemName: "店舗1", receiptTotalAmountYen: 1200 };
    renderWithProviders(<ReceiptListCard count={1} isLoading={false} receipts={[item]} />);
    expect(screen.getByTestId("item-expandable-content")).toHaveTextContent("店舗1");
  });

  it("単一明細でも金額が異なれば親行と明細行を表示する", () => {
    const item = { ...receipts[0], itemName: "牛乳", receiptTotalAmountYen: 1200 };
    renderWithProviders(<ReceiptListCard count={1} isLoading={false} receipts={[item]} />);
    expect(screen.getByTestId("receipt-group")).toBeInTheDocument();
    expect(screen.getByText("1,200円")).toBeInTheDocument();
    expect(screen.getByText("1,000円")).toBeInTheDocument();
    expect(screen.queryByText(/内訳:/)).not.toBeInTheDocument();
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
