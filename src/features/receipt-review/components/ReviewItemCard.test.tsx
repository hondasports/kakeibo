import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ReviewItemValues } from "../types/types";
import { ReviewItemCard } from "./ReviewItemCard";

const categories = [
  { _id: "cat-1", name: "食費", color: "#ff0000" },
  { _id: "cat-2", name: "日用品", color: "#00ff00" },
];

const categoryNamesById = new Map(categories.map((c) => [c._id, c.name]));

function makeItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: "item-1",
    itemName: "おにぎり",
    amountYen: "100",
    categoryId: "cat-1",
    usesReceiptCategory: false,
    ...overrides,
  } as unknown as ReviewItemValues;
}

function renderCard(props: Partial<Parameters<typeof ReviewItemCard>[0]>) {
  const base: Parameters<typeof ReviewItemCard>[0] = {
    item: makeItem(),
    index: 0,
    categories,
    categoryNamesById,
    productItems: [makeItem()] as unknown as Parameters<typeof ReviewItemCard>[0]["productItems"],
    selectedReviewDraft: null,
    isCategorySplit: false,
    isExpanded: false,
    onItemChange: vi.fn(),
    onRemoveItem: vi.fn(),
    onAssignCategoryToItems: vi.fn(),
    onDiscountTargetChange: vi.fn(),
    onToggleDetail: vi.fn(),
  };
  return renderWithProviders(<ReviewItemCard {...base} {...props} />);
}

describe("ReviewItemCard", () => {
  it("未配分では税込登録額を使うという補足を表示しない", () => {
    renderCard({
      item: makeItem({
        amountBasis: "tax_excluded",
        taxRatePercent: 8,
        taxResolutionStatus: "resolved",
        normalizedAmountYen: 100,
        taxAllocationStatus: "unallocated",
      }),
    });
    expect(
      screen.queryByText("税抜の印字額です。登録は下の税込額を使います"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("登録額（税込）：未確定")).toBeInTheDocument();
  });
  it("明細名と金額を表示する", () => {
    renderCard({});
    expect(screen.getByDisplayValue("おにぎり")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  });

  it("明細名を変更すると onItemChange が呼ばれる", () => {
    const onItemChange = vi.fn();
    renderCard({ onItemChange });
    const input = screen.getByDisplayValue("おにぎり");
    fireEvent.change(input, { target: { value: "お寿司" } });
    expect(onItemChange).toHaveBeenCalledWith("item-1", "itemName", "お寿司");
  });

  it("金額を変更すると onItemChange が呼ばれる", () => {
    const onItemChange = vi.fn();
    renderCard({ onItemChange });
    const input = screen.getByDisplayValue("100");
    fireEvent.change(input, { target: { value: "200" } });
    expect(onItemChange).toHaveBeenCalledWith("item-1", "amountYen", "200");
  });

  it("不確実な負額行は行種別を選んで解決できる", async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    renderCard({
      item: makeItem({
        itemName: "M002 玉ねぎ3玉",
        amountYen: "-16",
        lineType: "unknown",
        warnings: ["negative_amount_line_type_uncertain"],
      }),
      onItemChange,
    });

    expect(screen.getByText("負の金額の行種別を確認してください。")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "この負額行の種類" }));
    await user.click(screen.getByRole("option", { name: "販促・よりどり調整" }));
    expect(onItemChange).toHaveBeenCalledWith("item-1", "lineType", "promotion_adjustment");
  });

  it("削除ボタンを押すと onRemoveItem が呼ばれる", async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn();
    renderCard({ onRemoveItem });
    await user.click(screen.getByLabelText("おにぎりを削除"));
    expect(onRemoveItem).toHaveBeenCalledWith("item-1");
  });

  it("詳細を開くボタンを押すと onToggleDetail が呼ばれる", async () => {
    const user = userEvent.setup();
    const onToggleDetail = vi.fn();
    renderCard({ onToggleDetail });
    await user.click(screen.getByRole("button", { name: "詳細（通常は不要）" }));
    expect(onToggleDetail).toHaveBeenCalled();
  });

  it("未分類の場合は警告チップを表示する", () => {
    renderCard({ item: makeItem({ categoryId: "" }) });
    expect(screen.getByText("未分類")).toBeInTheDocument();
  });

  it("低信頼度の場合は警告チップを表示する", () => {
    renderCard({
      item: makeItem({
        confidence: { itemName: 0.5, amountYen: 0.9, categoryId: 0.9, categoryName: 0.9 },
      }),
    });
    expect(screen.getByText("低信頼度")).toBeInTheDocument();
  });

  it("税が未解決の場合は税率選択を表示する", () => {
    renderCard({
      item: makeItem({
        taxResolutionStatus: "unresolved",
        taxRatePercent: null,
        amountBasis: "unknown",
      }),
      isExpanded: true,
      enableItemTaxEditing: true,
    });
    expect(screen.getByRole("combobox", { name: "税率" })).toBeInTheDocument();
  });

  it("税率を変更すると onTaxRateChange が呼ばれる", async () => {
    const user = userEvent.setup();
    const onTaxRateChange = vi.fn();
    renderCard({
      item: makeItem({
        taxResolutionStatus: "unresolved",
        taxRatePercent: null,
        amountBasis: "unknown",
      }),
      isExpanded: true,
      enableItemTaxEditing: true,
      onTaxRateChange,
    });
    await user.click(screen.getByRole("combobox", { name: "税率" }));
    await user.click(screen.getByRole("option", { name: "8%" }));
    expect(onTaxRateChange).toHaveBeenCalledWith("item-1", 8);
  });

  it("税が解決済みで税抜の場合は登録額を表示する", () => {
    renderCard({
      item: makeItem({
        taxResolutionStatus: "resolved",
        taxAllocationStatus: "allocated",
        taxResolutionSource: "item_explicit",
        taxRatePercent: 10,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 110,
      }),
    });
    expect(screen.getByText("登録額: 110円（税込）")).toBeInTheDocument();
    expect(screen.getAllByText("税率 10%").length).toBeGreaterThanOrEqual(1);
  });

  it("混在税率を選んでいない場合は未解決でも税率選択を表示しない", () => {
    renderCard({
      item: makeItem({
        taxResolutionStatus: "unresolved",
        taxRatePercent: null,
        amountBasis: "unknown",
      }),
      isExpanded: true,
      enableItemTaxEditing: false,
    });
    expect(screen.queryByRole("combobox", { name: "税率" })).not.toBeInTheDocument();
  });

  it("警告があれば表示する", () => {
    renderCard({ item: makeItem({ warnings: ["amount_mismatch"] }) });
    expect(screen.getByText("金額を確認してください。")).toBeInTheDocument();
  });

  it("非展開時は税詳細を非表示にする", () => {
    renderCard({
      item: makeItem({
        taxResolutionStatus: "unresolved",
        taxRatePercent: null,
        amountBasis: "unknown",
      }),
      isExpanded: false,
    });
    expect(screen.getByLabelText("おにぎりの税詳細")).not.toBeVisible();
  });

  it("展開時は税詳細を表示する", () => {
    renderCard({
      item: makeItem({
        taxResolutionStatus: "unresolved",
        taxRatePercent: null,
        amountBasis: "unknown",
      }),
      isExpanded: true,
    });
    expect(screen.getByLabelText("おにぎりの税詳細")).toBeVisible();
  });
});
