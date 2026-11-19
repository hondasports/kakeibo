import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithDatePickers } from "../../../test/render";
import { YearNavigator } from "./YearNavigator";

describe("YearNavigator", () => {
  it("前年・今年・次年と年ピッカーを表示する", () => {
    renderWithDatePickers(
      <YearNavigator
        currentYear="2026"
        onCurrentYear={vi.fn()}
        onNextYear={vi.fn()}
        onPreviousYear={vi.fn()}
        onYearChange={vi.fn()}
        year="2025"
      />,
    );

    expect(screen.getByRole("button", { name: "前年へ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "今年へ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "次年へ" })).toBeEnabled();
    expect(screen.getByLabelText("2025年を選択")).toBeInTheDocument();
  });

  it("年ピッカーを開くボタンに、年を選ぶ操作だと分かる名前を付ける", () => {
    renderWithDatePickers(
      <YearNavigator
        currentYear="2026"
        onCurrentYear={vi.fn()}
        onNextYear={vi.fn()}
        onPreviousYear={vi.fn()}
        onYearChange={vi.fn()}
        year="2025"
      />,
    );

    expect(
      screen.getByRole("button", { name: "表示する年を選ぶ（現在: 2025年）" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /日付を選択/ })).not.toBeInTheDocument();
  });

  it("今年表示では次年と今年ボタンを無効化する", () => {
    renderWithDatePickers(
      <YearNavigator
        currentYear="2026"
        onCurrentYear={vi.fn()}
        onNextYear={vi.fn()}
        onPreviousYear={vi.fn()}
        onYearChange={vi.fn()}
        year="2026"
      />,
    );

    expect(screen.getByRole("button", { name: "今年へ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次年へ" })).toBeDisabled();
  });

  it("前年・今年・次年の操作を通知する", async () => {
    const user = userEvent.setup();
    const onPreviousYear = vi.fn();
    const onCurrentYear = vi.fn();
    const onNextYear = vi.fn();

    renderWithDatePickers(
      <YearNavigator
        currentYear="2026"
        onCurrentYear={onCurrentYear}
        onNextYear={onNextYear}
        onPreviousYear={onPreviousYear}
        onYearChange={vi.fn()}
        year="2025"
      />,
    );

    await user.click(screen.getByRole("button", { name: "前年へ" }));
    await user.click(screen.getByRole("button", { name: "今年へ" }));
    await user.click(screen.getByRole("button", { name: "次年へ" }));

    expect(onPreviousYear).toHaveBeenCalledTimes(1);
    expect(onCurrentYear).toHaveBeenCalledTimes(1);
    expect(onNextYear).toHaveBeenCalledTimes(1);
  });

  it("不正な年でもピッカーを表示する", () => {
    renderWithDatePickers(
      <YearNavigator
        currentYear="invalid"
        onCurrentYear={vi.fn()}
        onNextYear={vi.fn()}
        onPreviousYear={vi.fn()}
        onYearChange={vi.fn()}
        year="invalid"
      />,
    );

    expect(screen.getByLabelText("年を選択")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示する年を選ぶ" })).toBeInTheDocument();
  });

  it("年ピッカーで選んだ年を通知する", async () => {
    const user = userEvent.setup();
    const onYearChange = vi.fn();

    renderWithDatePickers(
      <YearNavigator
        currentYear="2026"
        onCurrentYear={vi.fn()}
        onNextYear={vi.fn()}
        onPreviousYear={vi.fn()}
        onYearChange={onYearChange}
        year="2025"
      />,
    );

    await user.click(screen.getByRole("button", { name: "表示する年を選ぶ（現在: 2025年）" }));
    await user.click(screen.getByRole("radio", { name: /^2024$/ }));

    expect(onYearChange).toHaveBeenCalledWith("2024");
  });
});
