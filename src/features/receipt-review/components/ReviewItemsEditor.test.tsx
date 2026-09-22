import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ReviewItemValues } from "../types/types";
import { ReviewItemsEditor } from "./ReviewItemsEditor";

vi.mock("./ReviewItemCard", () => ({
  ReviewItemCard: (props: { item: { id: string } }) => (
    <div data-testid="review-item-card">{props.item.id}</div>
  ),
}));

const categories = [
  { _id: "cat-1", name: "食費", color: "#ff0000" },
  { _id: "cat-2", name: "日用品", color: "#00ff00" },
];

const baseItem: ReviewItemValues = {
  id: "item-1",
  itemName: "商品A",
  amountYen: "1000",
  categoryId: "cat-1",
  usesReceiptCategory: false,
} as unknown as ReviewItemValues;

function renderEditor(props: Partial<Parameters<typeof ReviewItemsEditor>[0]>) {
  const base: Parameters<typeof ReviewItemsEditor>[0] = {
    categories,
    selectedReviewDraft: null,
    reviewItems: [],
    receiptAmount: 1000,
    onAddItem: vi.fn(),
    onItemChange: vi.fn(),
    onRemoveItem: vi.fn(),
    isCategorySplit: false,
    onCategorySplitChange: vi.fn(),
    onAssignCategoryToItems: vi.fn(),
    onDiscountTargetChange: vi.fn(),
  };
  return renderWithProviders(<ReviewItemsEditor {...base} {...props} />);
}

describe("ReviewItemsEditor", () => {
  it("明細が空の場合は空状態メッセージを表示する", () => {
    renderEditor({});
    expect(
      screen.getByText("明細はありません。既存の単一カテゴリ下書きとして確認できます。"),
    ).toBeInTheDocument();
  });

  it("明細を追加ボタンを押すと onAddItem が呼ばれる", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();
    renderEditor({ onAddItem });
    await user.click(screen.getByRole("button", { name: "明細を追加" }));
    expect(onAddItem).toHaveBeenCalled();
  });

  it("商品明細が2件以上の場合はカテゴリ分岐トグルを表示する", () => {
    const reviewItems = [
      { ...baseItem, id: "item-1" },
      { ...baseItem, id: "item-2", itemName: "商品B" },
    ] as unknown as ReviewItemValues[];
    renderEditor({ reviewItems });
    expect(screen.getByRole("button", { name: "カテゴリを分ける" })).toBeInTheDocument();
  });

  it("商品明細が1件以下の場合はカテゴリ分岐トグルを表示しない", () => {
    renderEditor({ reviewItems: [baseItem] });
    expect(screen.queryByRole("button", { name: "カテゴリを分ける" })).not.toBeInTheDocument();
  });

  it("カテゴリ分岐トグルを押すと onCategorySplitChange が反転して呼ばれる", async () => {
    const user = userEvent.setup();
    const onCategorySplitChange = vi.fn();
    const reviewItems = [
      { ...baseItem, id: "item-1" },
      { ...baseItem, id: "item-2", itemName: "商品B" },
    ] as unknown as ReviewItemValues[];
    renderEditor({ reviewItems, isCategorySplit: false, onCategorySplitChange });
    await user.click(screen.getByRole("button", { name: "カテゴリを分ける" }));
    expect(onCategorySplitChange).toHaveBeenCalledWith(true);
  });

  it("isCategorySplit=true の場合はトグルボタンのラベルが反転する", () => {
    const reviewItems = [
      { ...baseItem, id: "item-1" },
      { ...baseItem, id: "item-2", itemName: "商品B" },
    ] as unknown as ReviewItemValues[];
    renderEditor({ reviewItems, isCategorySplit: true });
    expect(screen.getByRole("button", { name: "単一カテゴリに戻す" })).toBeInTheDocument();
  });

  it("reviewItems の件数だけ ReviewItemCard をレンダリングする", () => {
    const reviewItems = [
      { ...baseItem, id: "item-1" },
      { ...baseItem, id: "item-2" },
    ] as unknown as ReviewItemValues[];
    renderEditor({ reviewItems });
    expect(screen.getAllByTestId("review-item-card")).toHaveLength(2);
  });

  it("割引明細は商品数としてカウントしないためカテゴリ分岐トグルが表示されない", () => {
    const reviewItems = [
      { ...baseItem, id: "item-1" },
      { ...baseItem, id: "item-2", itemName: "クーポン割引" },
    ] as unknown as ReviewItemValues[];
    renderEditor({ reviewItems });
    expect(screen.queryByRole("button", { name: "カテゴリを分ける" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("review-item-card")).toHaveLength(2);
  });

  it("reviewItems が空でも明細を追加ボタンは表示する", () => {
    renderEditor({});
    expect(screen.getByRole("button", { name: "明細を追加" })).toBeInTheDocument();
  });
});
