import type { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import type { ExpenseEntryCategory } from "../types/types";
import { CategoryGrid } from "./CategoryGrid";

const categories: ExpenseEntryCategory[] = [
  { _id: "cat-1" as Id<"categories">, name: "食費", color: "#AAB7C4" },
  { _id: "cat-2" as Id<"categories">, name: "日用品", color: "#A6B28B" },
  { _id: "cat-3" as Id<"categories">, name: "交通費", color: "#B7C4A6" },
  { _id: "cat-4" as Id<"categories">, name: "娯楽費", color: "#C4B7A6" },
  { _id: "cat-5" as Id<"categories">, name: "衣服", color: "#A6B7C4" },
  { _id: "cat-6" as Id<"categories">, name: "医療", color: "#C4A6B7" },
  { _id: "cat-7" as Id<"categories">, name: "その他", color: "#B7B7A6" },
];

function renderGrid(initialCategoryId?: string) {
  function Harness() {
    const [categoryId, setCategoryId] = useState(initialCategoryId);
    return (
      <CategoryGrid
        ariaLabel="カテゴリ候補"
        categories={categories}
        selectedCategoryId={categoryId}
        onSelect={setCategoryId}
      />
    );
  }
  renderWithProviders(<Harness />);
  return screen.getByRole("listbox", { name: "カテゴリ候補" });
}

describe("CategoryGrid", () => {
  beforeEach(() => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("選択中のカテゴリだけがタブ停止になり、他は -1 になる", () => {
    const listbox = renderGrid("cat-3");
    const options = within(listbox).getAllByRole("option");

    expect(options).toHaveLength(categories.length);
    options.forEach((option, index) => {
      expect(option).toHaveAttribute("tabindex", index === 2 ? "0" : "-1");
    });
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });

  it("未選択のときは先頭がタブ停止になる", () => {
    const listbox = renderGrid();
    const options = within(listbox).getAllByRole("option");

    expect(options[0]).toHaveAttribute("tabindex", "0");
    expect(options.slice(1).every((option) => option.tabIndex === -1)).toBe(true);
    expect(options.every((option) => option.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("Tab では選択中のカテゴリへ1ストップで移動する", async () => {
    const user = userEvent.setup();
    renderGrid("cat-4");

    await user.tab();

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[3]).toHaveFocus();
    expect(options[3]).toHaveAttribute("aria-selected", "true");
  });

  it("矢印キーでカテゴリを移動・選択し、フォーカスも追従する", async () => {
    const user = userEvent.setup();
    const listbox = renderGrid("cat-1");
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{ArrowRight}");

    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveFocus();
    expect(options[0]).toHaveAttribute("tabindex", "-1");
    expect(options[1]).toHaveAttribute("tabindex", "0");

    await user.keyboard("{ArrowLeft}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("SPの列数（2列）で ArrowDown が次の行へ移動する", async () => {
    stubViewportWidth(390);
    const user = userEvent.setup();
    const listbox = renderGrid("cat-1");
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{ArrowDown}");

    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("PCの列数（5列）で ArrowDown が5つ先へ移動する", async () => {
    const user = userEvent.setup();
    const listbox = renderGrid("cat-1");
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{ArrowDown}");

    expect(options[5]).toHaveAttribute("aria-selected", "true");
    expect(options[5]).toHaveFocus();
  });

  it("Home/End で先頭・末尾へ移動する", async () => {
    const user = userEvent.setup();
    const listbox = renderGrid("cat-1");
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{End}");
    expect(options[6]).toHaveAttribute("aria-selected", "true");
    expect(options[6]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("Enter でフォーカス中のカテゴリを選択する", async () => {
    const user = userEvent.setup();
    const listbox = renderGrid();
    const options = within(listbox).getAllByRole("option");

    options[1].focus();
    await user.keyboard("{Enter}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });
});
