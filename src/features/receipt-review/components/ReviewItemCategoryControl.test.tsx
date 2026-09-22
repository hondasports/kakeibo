import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ReviewItemValues } from "../types/types";
import { ReviewItemCategoryControl } from "./ReviewItemCategoryControl";

const categories = [
  { _id: "cat-1", name: "食費", color: "#ff0000" },
  { _id: "cat-2", name: "日用品", color: "#00ff00" },
];

const productItems = [
  { id: "item-1", itemName: "おにぎり" },
  { id: "item-2", itemName: "飲料" },
] as unknown as Parameters<typeof ReviewItemCategoryControl>[0]["productItems"];

function makeItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: "target",
    itemName: "商品",
    amountYen: "1000",
    categoryId: "cat-1",
    usesReceiptCategory: false,
    ...overrides,
  } as unknown as ReviewItemValues;
}

type Props = Parameters<typeof ReviewItemCategoryControl>[0];
type RenderOptions = Partial<Omit<Props, "item">> & { item?: Partial<ReviewItemValues> };

function renderControl(options: RenderOptions) {
  const base: Props = {
    item: makeItem(),
    categories,
    categoryName: "食費",
    productItems,
    isCategorySplit: false,
    onAssignCategoryToItems: vi.fn(),
    onDiscountTargetChange: vi.fn(),
  };
  const { item: itemOverrides, ...rest } = options;
  const item = makeItem(itemOverrides);
  return renderWithProviders(<ReviewItemCategoryControl {...base} {...rest} item={item} />);
}

describe("ReviewItemCategoryControl", () => {
  it("非カテゴリ分岐時はレシート全体カテゴリメッセージを表示する", () => {
    renderControl({ item: { usesReceiptCategory: true } });
    expect(screen.getByText("カテゴリ：レシート全体（食費）")).toBeInTheDocument();
  });

  it("非カテゴリ分岐時は個別カテゴリ名を表示する", () => {
    renderControl({ item: { usesReceiptCategory: false, categoryId: "cat-1" } });
    expect(screen.getByText("カテゴリ：食費")).toBeInTheDocument();
  });

  it("非カテゴリ分岐時はカテゴリ名が不明な場合は未分類と表示する", () => {
    renderControl({ categoryName: undefined });
    expect(screen.getByText("カテゴリ：未分類")).toBeInTheDocument();
  });

  it("カテゴリ分岐時は検索できるカテゴリ欄を表示する", () => {
    renderControl({ isCategorySplit: true });
    expect(screen.getByLabelText("明細カテゴリ")).toBeInTheDocument();
  });

  it("カテゴリ分岐時にカテゴリを変更すると onAssignCategoryToItems が呼ばれる", async () => {
    const user = userEvent.setup();
    const onAssignCategoryToItems = vi.fn();
    renderControl({ isCategorySplit: true, onAssignCategoryToItems });

    await user.click(screen.getByLabelText("明細カテゴリ"));
    await user.click(screen.getByRole("option", { name: "日用品" }));

    expect(onAssignCategoryToItems).toHaveBeenCalledWith(["target"], "cat-2");
  });

  it("割引明細は対象商品選択セレクトを表示する", () => {
    renderControl({ item: { itemName: "クーポン割引" } });
    expect(screen.getByLabelText("割引対象の商品")).toBeInTheDocument();
  });

  it("割引明細で対象商品を選択すると onDiscountTargetChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onDiscountTargetChange = vi.fn();
    renderControl({ item: { itemName: "クーポン割引" }, onDiscountTargetChange });

    await user.click(screen.getByLabelText("割引対象の商品"));
    await user.click(screen.getByRole("option", { name: "おにぎり" }));

    expect(onDiscountTargetChange).toHaveBeenCalledWith("target", "item-1");
  });

  it("割引対象未選択の場合はヘルパーテキストを表示する", () => {
    renderControl({ item: { itemName: "クーポン割引", categoryId: "" } });
    expect(screen.getByText("対象商品を選択してください")).toBeInTheDocument();
  });

  it("割引対象を選択済みの場合は補足を表示しない", () => {
    renderControl({
      item: { itemName: "クーポン割引", categoryId: "cat-1", discountTargetItemId: "item-1" },
    });
    expect(screen.queryByText("対象商品のカテゴリから減額します")).not.toBeInTheDocument();
  });

  it("割引対象商品が空でもセレクトをレンダリングする", () => {
    renderControl({
      item: { itemName: "クーポン割引" },
      productItems: [] as unknown as Parameters<
        typeof ReviewItemCategoryControl
      >[0]["productItems"],
    });
    expect(screen.getByLabelText("割引対象の商品")).toBeInTheDocument();
  });

  it("カテゴリ一覧が空でもカテゴリ分岐時はセレクトをレンダリングする", () => {
    renderControl({
      isCategorySplit: true,
      categories: [],
      item: { categoryId: "" },
    });
    expect(screen.getByLabelText("明細カテゴリ")).toBeInTheDocument();
  });
});
