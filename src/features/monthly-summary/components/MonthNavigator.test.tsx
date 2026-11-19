import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { jaJP } from "@mui/x-date-pickers/locales";
import "dayjs/locale/ja";
import { renderWithProviders } from "../../../test/render";
import { MonthNavigator } from "./MonthNavigator";

describe("MonthNavigator", () => {
  it("不正な年月でも安全なプレースホルダーを表示する", () => {
    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="invalid"
          month="invalid"
          onCurrentMonth={vi.fn()}
          onMonthChange={vi.fn()}
          onNextMonth={vi.fn()}
          onPreviousMonth={vi.fn()}
        />
      </LocalizationProvider>,
    );

    expect(screen.getByLabelText("年月を選択")).toBeInTheDocument();
  });

  it("カレンダーを開くボタンは、月を選ぶ操作だと分かる名前を持つ", () => {
    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="2026-11"
          month="2026-11"
          onCurrentMonth={vi.fn()}
          onMonthChange={vi.fn()}
          onNextMonth={vi.fn()}
          onPreviousMonth={vi.fn()}
        />
      </LocalizationProvider>,
    );

    expect(
      screen.getByRole("button", { name: "表示する月を選ぶ（現在: 2026年11月）" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /日付を選択/ })).not.toBeInTheDocument();
  });

  it("年月ピッカーを開ける", async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();

    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="2026-08"
          month="2026-08"
          onCurrentMonth={vi.fn()}
          onMonthChange={onMonthChange}
          onNextMonth={vi.fn()}
          onPreviousMonth={vi.fn()}
        />
      </LocalizationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "表示する月を選ぶ（現在: 2026年8月）" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("年選択途中では遷移せず、月選択時に年月を返す", async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();

    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="2026-08"
          month="2026-08"
          onCurrentMonth={vi.fn()}
          onMonthChange={onMonthChange}
          onNextMonth={vi.fn()}
          onPreviousMonth={vi.fn()}
        />
      </LocalizationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "表示する月を選ぶ（現在: 2026年8月）" }));
    await user.click(
      screen.getByRole("button", { name: /カレンダー表示から年選択表示に切り替える/ }),
    );
    await user.click(screen.getByRole("radio", { name: /^2025$/ }));

    expect(onMonthChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /^8月$/ }));

    expect(onMonthChange).toHaveBeenCalledOnce();
    expect(onMonthChange).toHaveBeenCalledWith("2025-08");
  });

  it("当月では今月と次月を無効にする", () => {
    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="2026-08"
          month="2026-08"
          onCurrentMonth={vi.fn()}
          onMonthChange={vi.fn()}
          onNextMonth={vi.fn()}
          onPreviousMonth={vi.fn()}
        />
      </LocalizationProvider>,
    );

    expect(screen.getByRole("button", { name: "今月へ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次月へ" })).toBeDisabled();
  });

  it("前月・次月・今月のコールバックを呼ぶ", async () => {
    const user = userEvent.setup();
    const handlers = {
      current: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };

    renderWithProviders(
      <LocalizationProvider
        adapterLocale="ja"
        dateAdapter={AdapterDayjs}
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        <MonthNavigator
          currentMonth="2026-08"
          month="2026-07"
          onCurrentMonth={handlers.current}
          onMonthChange={vi.fn()}
          onNextMonth={handlers.next}
          onPreviousMonth={handlers.previous}
        />
      </LocalizationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "前月へ" }));
    await user.click(screen.getByRole("button", { name: "次月へ" }));
    await user.click(screen.getByRole("button", { name: "今月へ" }));

    expect(handlers.previous).toHaveBeenCalledOnce();
    expect(handlers.next).toHaveBeenCalledOnce();
    expect(handlers.current).toHaveBeenCalledOnce();
  });
});
