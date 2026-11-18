import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { designTokens } from "../../../designTokens";
import { renderWithProviders } from "../../../test/render";
import { MonthlySpendingCalendar } from "./MonthlySpendingCalendar";

describe("MonthlySpendingCalendar", () => {
  it("支出額の濃淡と収入の区別を月間カレンダーへ表示する", () => {
    renderWithProviders(
      <MonthlySpendingCalendar
        expenses={[
          { amountYen: 1000, date: "2026-07-01" },
          { amountYen: 5000, date: "2026-07-15" },
        ]}
        incomes={[{ amountYen: 250000, date: "2026-07-15" }]}
        month="2026-07"
        onDateSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "支出カレンダー" })).toBeInTheDocument();
    expect(screen.getByText("支出額の濃さ")).toBeInTheDocument();
    expect(screen.getByText("収入あり")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /2026年7月1日/ })).toHaveAttribute(
      "data-expense-intensity",
      "1",
    );
    expect(screen.getByRole("button", { name: /2026年7月15日/ })).toHaveAttribute(
      "data-expense-intensity",
      "4",
    );
    expect(screen.getByRole("button", { name: /2026年7月15日/ })).toHaveAttribute(
      "data-has-income",
      "true",
    );
  });

  it("日付を押すと選択コールバックへISO日付を渡す", async () => {
    const user = userEvent.setup();
    const onDateSelect = vi.fn();

    renderWithProviders(
      <MonthlySpendingCalendar
        expenses={[]}
        incomes={[]}
        month="2026-07"
        onDateSelect={onDateSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /2026年7月10日/ }));

    expect(onDateSelect).toHaveBeenCalledWith("2026-07-10");
  });

  it("最も濃い日でも金額の文字は濃い文字色で表示する", () => {
    renderWithProviders(
      <MonthlySpendingCalendar
        expenses={[{ amountYen: 5000, date: "2026-07-15" }]}
        incomes={[]}
        month="2026-07"
        onDateSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /2026年7月15日/ })).toHaveAttribute(
      "data-expense-intensity",
      "4",
    );
    expect(screen.getByRole("button", { name: /2026年7月15日/ })).toHaveStyle({
      color: designTokens.color.text.primary,
    });
  });

  it("読み込み中はカレンダーのスケルトンを表示する", () => {
    renderWithProviders(
      <MonthlySpendingCalendar
        expenses={[]}
        incomes={[]}
        isLoading
        month="2026-07"
        onDateSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("monthly-spending-calendar-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /2026年7月10日/ })).not.toBeInTheDocument();
  });
});

describe("MonthlySpendingCalendar の今日より後の日", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setToday(instant: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
  }

  it("今日より後の日は「支出なし」を出さず、押せないようにする", () => {
    // JST 2026-11-18 の午前。
    setToday("2026-11-18T03:00:00+09:00");

    renderWithProviders(
      <MonthlySpendingCalendar expenses={[]} incomes={[]} month="2026-11" onDateSelect={vi.fn()} />,
    );

    const yesterday = screen.getByRole("button", { name: "2026年11月17日、支出なし、収入なし" });
    const today = screen.getByRole("button", { name: "2026年11月18日、支出なし、収入なし" });
    const tomorrow = screen.getByRole("button", { name: "2026年11月19日（これからの日）" });

    expect(within(yesterday).getByText("支出なし")).toBeInTheDocument();
    expect(within(today).getByText("支出なし")).toBeInTheDocument();
    expect(yesterday).toBeEnabled();
    expect(today).toBeEnabled();

    expect(tomorrow).toBeDisabled();
    expect(within(tomorrow).queryByText("支出なし")).not.toBeInTheDocument();
  });

  it("月をまたぐ判定でも、来月以降の日は押せず「支出なし」を出さない", () => {
    setToday("2026-11-18T03:00:00+09:00");

    renderWithProviders(
      <MonthlySpendingCalendar expenses={[]} incomes={[]} month="2026-12" onDateSelect={vi.fn()} />,
    );

    const firstDay = screen.getByRole("button", { name: "2026年12月1日（これからの日）" });
    expect(firstDay).toBeDisabled();
    expect(within(firstDay).queryByText("支出なし")).not.toBeInTheDocument();
  });

  it("過去の月の日は、支出が0円でも「支出なし」を出して押せる", () => {
    setToday("2026-11-18T03:00:00+09:00");

    renderWithProviders(
      <MonthlySpendingCalendar expenses={[]} incomes={[]} month="2026-10" onDateSelect={vi.fn()} />,
    );

    const lastDay = screen.getByRole("button", { name: "2026年10月31日、支出なし、収入なし" });
    expect(within(lastDay).getByText("支出なし")).toBeInTheDocument();
    expect(lastDay).toBeEnabled();
  });

  it("日本時間の日付で今日を判定する（UTCでは前日の15:00以降）", () => {
    // UTC 2026-11-18 15:00 は JST 2026-11-19 00:00。今日は 11/19 になる。
    setToday("2026-11-18T15:00:00Z");

    renderWithProviders(
      <MonthlySpendingCalendar expenses={[]} incomes={[]} month="2026-11" onDateSelect={vi.fn()} />,
    );

    const today = screen.getByRole("button", { name: "2026年11月19日、支出なし、収入なし" });
    const tomorrow = screen.getByRole("button", { name: "2026年11月20日（これからの日）" });

    expect(within(today).getByText("支出なし")).toBeInTheDocument();
    expect(today).toBeEnabled();
    expect(tomorrow).toBeDisabled();
  });
});
