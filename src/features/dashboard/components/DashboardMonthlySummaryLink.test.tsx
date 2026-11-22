import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DashboardMonthlySummaryLink } from "./DashboardMonthlySummaryLink";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

describe("DashboardMonthlySummaryLink", () => {
  it("指定した月次サマリーへのリンクを表示する", () => {
    renderWithProviders(
      <MemoryRouter>
        <DashboardMonthlySummaryLink month="2025-08" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "今月の月次サマリーを見る" })).toHaveAttribute(
      "href",
      "/months/2025-08",
    );
  });
});
