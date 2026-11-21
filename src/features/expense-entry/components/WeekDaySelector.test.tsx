import { useState } from "react";
import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import { WeekDaySelector } from "./WeekDaySelector";

function renderSelector(initialDate = "2026-06-02") {
  function Harness() {
    const [date, setDate] = useState(initialDate);
    return (
      <WeekDaySelector
        weekEndDate="2026-06-08"
        weekStartDate="2026-06-02"
        selectedDate={date}
        onSelectDate={setDate}
      />
    );
  }
  renderWithProviders(<Harness />);
  return screen.getByRole("listbox", { name: "週内の日付候補" });
}

describe("WeekDaySelector", () => {
  beforeEach(() => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("選択中の日付だけがタブ停止になり、他は -1 になる", () => {
    const listbox = renderSelector();
    const options = within(listbox).getAllByRole("option");

    expect(options).toHaveLength(7);
    options.forEach((option, index) => {
      expect(option).toHaveAttribute("tabindex", index === 0 ? "0" : "-1");
    });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Tab では選択中の日付へ1ストップで移動する", async () => {
    const user = userEvent.setup();
    renderSelector("2026-06-05");

    await user.tab();

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[3]).toHaveFocus();
    expect(options[3]).toHaveAttribute("aria-selected", "true");
  });

  it("選択日が週に無い場合は先頭がタブ停止になる", () => {
    const listbox = renderSelector("2026-06-09");
    const options = within(listbox).getAllByRole("option");

    expect(options[0]).toHaveAttribute("tabindex", "0");
    expect(options.slice(1).every((option) => option.tabIndex === -1)).toBe(true);
  });

  it("ArrowRight/ArrowLeft で日付を移動・選択し、フォーカスも追従する", async () => {
    const user = userEvent.setup();
    const listbox = renderSelector();
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

  it("SPの列数（4列）で ArrowDown/ArrowUp が行を移動する", async () => {
    stubViewportWidth(390);
    const user = userEvent.setup();
    const listbox = renderSelector();
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{ArrowDown}");

    expect(options[4]).toHaveAttribute("aria-selected", "true");
    expect(options[4]).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("PCでは1行表示のため上下矢印は端で留まる", async () => {
    const user = userEvent.setup();
    const listbox = renderSelector();
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("Home/End で週の先頭・末尾へ移動する", async () => {
    const user = userEvent.setup();
    const listbox = renderSelector();
    const options = within(listbox).getAllByRole("option");

    options[0].focus();
    await user.keyboard("{End}");
    expect(options[6]).toHaveAttribute("aria-selected", "true");
    expect(options[6]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveFocus();
  });

  it("Enter/Space でフォーカス中の日付を選択する", async () => {
    const user = userEvent.setup();
    const listbox = renderSelector("2026-06-09");
    const options = within(listbox).getAllByRole("option");

    options[2].focus();
    await user.keyboard("{Enter}");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });
});
