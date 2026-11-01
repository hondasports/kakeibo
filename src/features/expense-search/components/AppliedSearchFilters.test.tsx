import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EMPTY_EXPENSE_SEARCH_FORM } from "../lib/searchParams";
import { AppliedSearchFilters } from "./AppliedSearchFilters";

it("上下限の円表示が実行環境の数値ロケールに依存しない", () => {
  const original = Number.prototype.toLocaleString;
  const locale = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
  ) {
    return original.call(this, "de-DE");
  });
  try {
    render(
      <AppliedSearchFilters
        state={{ ...EMPTY_EXPENSE_SEARCH_FORM, minAmountYen: "1234", maxAmountYen: "56789" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("1,234円以上")).toBeInTheDocument();
    expect(screen.getByText("56,789円以下")).toBeInTheDocument();
  } finally {
    locale.mockRestore();
  }
});
