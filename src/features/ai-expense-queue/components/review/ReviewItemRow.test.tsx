import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewItemRow } from "./ReviewItemRow";
import type { ReviewItemValues } from "../../types/types";

const item: ReviewItemValues = {
  id: "item-1",
  itemName: "ホットケーキミックス 200g",
  amountYen: "1234",
  categoryId: "food",
  taxRatePercent: 8,
  amountBasis: "tax_excluded",
  taxResolutionStatus: "resolved",
  taxResolutionSource: "item_explicit",
};

function renderRow(overrides: Partial<Parameters<typeof ReviewItemRow>[0]> = {}) {
  const props = {
    item,
    index: 0,
    issues: [],
    open: false,
    registerRef: vi.fn(),
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    busy: false,
    categoryName: "食費",
    children: <input aria-label="明細名" />,
    ...overrides,
  };
  render(<ReviewItemRow {...props} />);
  return props;
}

describe("ReviewItemRow", () => {
  it("番号・商品名・金額・税率・操作ボタンを1行で表示する", () => {
    renderRow();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("ホットケーキミックス 200g")).toBeInTheDocument();
    expect(screen.getByText("1,234円")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByText("税抜")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認・修正" })).toBeInTheDocument();
  });

  it("税率未確定は未確定と表示する", () => {
    renderRow({
      item: {
        ...item,
        taxRatePercent: null,
        amountBasis: "unknown",
        taxResolutionStatus: "unresolved",
        taxResolutionSource: undefined,
      },
    });
    expect(screen.getAllByText(/未確定/).length).toBeGreaterThan(0);
  });

  it("負数の金額をカンマ区切りで表示する", () => {
    renderRow({ item: { ...item, itemName: "値引", amountYen: "-1234", lineType: "discount" } });
    expect(screen.getByText("-1,234円")).toBeInTheDocument();
  });

  it("割引対象の商品名を補足表示する", () => {
    renderRow({
      item: { ...item, itemName: "値引", amountYen: "-50", lineType: "discount" },
      targetName: "対象商品のとても長い名前テスト商品",
    });
    expect(
      screen.getAllByText(/割引対象：対象商品のとても長い名前テスト商品/).length,
    ).toBeGreaterThan(0);
  });

  it("修正必須・確認推奨のマーカーを表示する", () => {
    renderRow({
      issues: [
        { id: "a", message: "m", target: "item-1", required: true },
        { id: "b", message: "m", target: "item-1", required: false },
      ],
    });
    expect(screen.getAllByText(/修正必須/).length).toBeGreaterThan(0);
  });

  it("サマリのクリックとボタンでトグルできる", async () => {
    const user = userEvent.setup();
    const props = renderRow();
    const details = screen.getByText("ホットケーキミックス 200g").closest("details")!;
    await user.click(details.querySelector("summary")!);
    expect(props.onToggle).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "確認・修正" }));
    expect(props.onToggle).toHaveBeenCalledTimes(2);
  });

  it("展開中は閉じるボタンを表示し、内容のフォーカスで開いたままにする", async () => {
    const user = userEvent.setup();
    const props = renderRow({ open: true });
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("明細名"));
    expect(props.onOpen).toHaveBeenCalled();
  });
});
