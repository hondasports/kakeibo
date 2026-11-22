import { useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithDatePickers } from "../../../test/render";

const { useMediaQueryMock } = vi.hoisted(() => ({
  useMediaQueryMock: vi.fn((_query?: unknown) => false),
}));

vi.mock("@mui/material", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@mui/material")>();
  return { ...mod, useMediaQuery: (query: unknown) => useMediaQueryMock(query) };
});
import { EMPTY_EXPENSE_SEARCH_FORM } from "../lib/searchParams";
import { ExpenseSearchFilters } from "./ExpenseSearchFilters";

function StatefulFilters({ onClear, onSubmit }: { onClear: () => void; onSubmit: () => void }) {
  const [state, setState] = useState(EMPTY_EXPENSE_SEARCH_FORM);
  return (
    <ExpenseSearchFilters
      categories={[{ _id: "cat-food", name: "食費" }]}
      state={state}
      onChange={setState}
      onClear={() => {
        setState(EMPTY_EXPENSE_SEARCH_FORM);
        onClear();
      }}
      onSubmit={onSubmit}
    />
  );
}

describe("ExpenseSearchFilters", () => {
  it("条件を入力して絞り込む・クリアできる", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onSubmit = vi.fn();

    renderWithDatePickers(<StatefulFilters onClear={onClear} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("キーワード"), "北浜");
    await user.type(screen.getByLabelText("金額の下限"), "12ab34");
    await user.type(screen.getByLabelText("金額の上限"), "5,000円");
    expect(screen.getByLabelText("金額の下限")).toHaveValue("1234");
    expect(screen.getByLabelText("金額の上限")).toHaveValue("5000");
    expect(document.querySelector('input[type="date"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "開始日を選択" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("gridcell", { name: "1" }));
    expect(
      within(screen.getByRole("group", { name: "開始日" })).getByRole("spinbutton", { name: "日" }),
    ).toHaveAttribute("aria-valuenow", "1");

    await user.click(screen.getByRole("button", { name: "終了日を選択" }));
    await user.click(screen.getByRole("gridcell", { name: "2" }));
    expect(
      within(screen.getByRole("group", { name: "終了日" })).getByRole("spinbutton", { name: "日" }),
    ).toHaveAttribute("aria-valuenow", "2");

    await user.click(screen.getByLabelText("カテゴリ"));
    await user.click(screen.getByRole("option", { name: "食費" }));
    await user.click(screen.getByRole("button", { name: "絞り込む" }));
    expect(onSubmit).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "すべてクリア" }));
    expect(onClear).toHaveBeenCalled();
  }, 15_000);

  it("期間を指定しているとき「期間を指定しない」は選択中に見えない", () => {
    renderWithDatePickers(
      <ExpenseSearchFilters
        categories={[]}
        state={{ ...EMPTY_EXPENSE_SEARCH_FORM, startDate: "2026-08-03", endDate: "2026-08-17" }}
        onChange={() => undefined}
        onClear={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "期間を指定しない" }).className).toContain(
      "MuiButton-outlined",
    );
  });

  it("期間未指定のとき「期間を指定しない」は選択中に見える", () => {
    renderWithDatePickers(
      <ExpenseSearchFilters
        categories={[]}
        state={EMPTY_EXPENSE_SEARCH_FORM}
        onChange={() => undefined}
        onClear={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "期間を指定しない" }).className).toContain(
      "MuiButton-contained",
    );
  });

  it("SPでは閉じていても未適用の表示が見え、開閉はaria-expandedで伝わる", async () => {
    useMediaQueryMock.mockReturnValue(true);
    const user = userEvent.setup();
    renderWithDatePickers(
      <ExpenseSearchFilters
        categories={[]}
        state={EMPTY_EXPENSE_SEARCH_FORM}
        hasUnappliedChanges
        onChange={() => undefined}
        onClear={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const toggle = screen.getByRole("button", { name: "絞り込み条件を開く" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("変更はまだ適用されていません")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "絞り込み条件を閉じる" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    useMediaQueryMock.mockReturnValue(false);
  });

  it("不正な日付は空扱いし、選択した日付はクリアできる", async () => {
    const user = userEvent.setup();

    function InvalidDateFilters() {
      const [state, setState] = useState({
        ...EMPTY_EXPENSE_SEARCH_FORM,
        startDate: "not-a-date",
      });
      return (
        <ExpenseSearchFilters
          categories={[]}
          state={state}
          onChange={setState}
          onClear={() => setState(EMPTY_EXPENSE_SEARCH_FORM)}
          onSubmit={() => undefined}
        />
      );
    }

    renderWithDatePickers(<InvalidDateFilters />);
    expect(
      within(screen.getByRole("group", { name: "開始日" })).getByRole("spinbutton", { name: "日" }),
    ).toHaveAttribute("aria-valuetext", "空");

    await user.click(screen.getByRole("button", { name: "開始日を選択" }));
    await user.click(screen.getByRole("gridcell", { name: "1" }));
    expect(
      within(screen.getByRole("group", { name: "開始日" })).getByRole("spinbutton", { name: "日" }),
    ).toHaveAttribute("aria-valuenow", "1");

    await user.click(screen.getByRole("button", { name: "クリア" }));
    expect(
      within(screen.getByRole("group", { name: "開始日" })).getByRole("spinbutton", { name: "日" }),
    ).toHaveAttribute("aria-valuetext", "空");
  }, 15_000);
});
