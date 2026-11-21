import type { Id } from "../../../../convex/_generated/dataModel";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { collectDocumentCssText } from "../../../test/cssText";
import { renderWithProviders } from "../../../test/render";
import type { ExpenseEntryCategory, ExpenseEntryItem } from "../types/types";
import { ExpenseItemRow } from "./ExpenseItemRow";

const categories: ExpenseEntryCategory[] = [
  { _id: "cat-food" as Id<"categories">, name: "食費", color: "#AAB7C4" },
  { _id: "cat-daily" as Id<"categories">, name: "日用品", color: "#A6B28B" },
];

const item: ExpenseEntryItem = { categoryId: "", amountYen: "", title: "", memo: "" };

function renderRow(index: number, canRemove = true, onRemove = vi.fn()) {
  renderWithProviders(
    <ExpenseItemRow
      index={index}
      item={item}
      itemErrors={{}}
      categories={categories}
      onItemChange={() => {}}
      onRemove={onRemove}
      canRemove={canRemove}
    />,
  );
  return onRemove;
}

describe("ExpenseItemRow", () => {
  it("削除ボタンの aria-label が行番号を含む", () => {
    renderRow(1);

    expect(screen.getByRole("button", { name: "項目2を削除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "削除" })).not.toBeInTheDocument();
  });

  it("複数行では各行の削除ボタン名が区別できる", () => {
    renderWithProviders(
      <>
        <ExpenseItemRow
          index={0}
          item={item}
          itemErrors={{}}
          categories={categories}
          onItemChange={() => {}}
          onRemove={() => {}}
          canRemove
        />
        <ExpenseItemRow
          index={1}
          item={item}
          itemErrors={{}}
          categories={categories}
          onItemChange={() => {}}
          onRemove={() => {}}
          canRemove
        />
      </>,
    );

    expect(screen.getByRole("button", { name: "項目1を削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "項目2を削除" })).toBeInTheDocument();
  });

  it("削除ボタンを押すと onRemove が呼ばれる", async () => {
    const user = userEvent.setup();
    const onRemove = renderRow(0);

    await user.click(screen.getByRole("button", { name: "項目1を削除" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("canRemove が false のとき削除ボタンを表示しない", () => {
    renderRow(0, false);

    expect(screen.queryByRole("button", { name: /を削除$/ })).not.toBeInTheDocument();
  });

  it("削除ボタンは900px未満で44px以上のタップ対象、900px以上では制約しない", () => {
    renderRow(0);
    const button = screen.getByRole("button", { name: "項目1を削除" });

    const css = collectDocumentCssText();
    const className = Array.from(button.classList)
      .filter((name) => name.startsWith("css-"))
      .find((name) => new RegExp(`\\.${name}\\s*\\{[^}]*min-`).test(css));
    expect(className).toBeTruthy();

    const mediaRule = (query: string, declarations: string) =>
      new RegExp(
        `@media \\(min-width:\\s*${query}\\)\\s*\\{[^@]*\\.${className}\\s*\\{[^}]*${declarations}`,
      );

    expect(css).toMatch(mediaRule("0px", "min-width:\\s*44px"));
    expect(css).toMatch(mediaRule("0px", "min-height:\\s*44px"));
    expect(css).toMatch(mediaRule("900px", "min-width:\\s*auto"));
    expect(css).toMatch(mediaRule("900px", "min-height:\\s*auto"));
    expect(css).not.toMatch(mediaRule("600px", "min-width:"));
  });
});
