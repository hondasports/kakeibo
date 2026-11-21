import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { WeekStatusPanel } from "./WeekStatusPanel";

describe("WeekStatusPanel", () => {
  it("今週の件数と合計金額を表示し、根拠のない進捗バーは出さない", () => {
    renderWithProviders(
      <WeekStatusPanel
        count={3}
        isCurrentWeek={true}
        totalAmountYen={12345}
        weekStartDate="2026-06-15"
      />,
    );

    expect(screen.getByRole("heading", { name: "今週の進捗" })).toBeInTheDocument();
    expect(screen.getByText("3件・合計 12,345円")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("今週以外を表示中は見出しが表示週に一致する", () => {
    renderWithProviders(
      <WeekStatusPanel
        count={1}
        isCurrentWeek={false}
        totalAmountYen={500}
        weekStartDate="2026-06-08"
      />,
    );

    expect(screen.getByRole("heading", { name: "6/8週の進捗" })).toBeInTheDocument();
    expect(screen.getByText("1件・合計 500円")).toBeInTheDocument();
  });
});
