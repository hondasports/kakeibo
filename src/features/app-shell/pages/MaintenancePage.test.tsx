import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MaintenancePage } from "./MaintenancePage";

describe("MaintenancePage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("メンテナンス文言と復帰導線を表示する", () => {
    renderWithProviders(<MaintenancePage />);

    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Suzumemo スズメモ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ただいまメンテナンス中です" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Suzumemo を安心して使えるように、ただいま整えています。しばらく時間をおいてから、もう一度お試しください。/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
  });

  it("環境変数で期間・理由・復旧見込みを渡すと表示する", () => {
    vi.stubEnv("VITE_APP_MAINTENANCE_PERIOD", "2026年11月24日 02:00〜06:00（予定）");
    vi.stubEnv("VITE_APP_MAINTENANCE_REASON", "データベース更新のため");
    vi.stubEnv("VITE_APP_MAINTENANCE_ETA", "2026年11月24日 06:00");

    renderWithProviders(<MaintenancePage />);

    expect(screen.getByText(/期間: 2026年11月24日 02:00〜06:00/)).toBeInTheDocument();
    expect(screen.getByText(/理由: データベース更新のため/)).toBeInTheDocument();
    expect(screen.getByText(/復旧見込み: 2026年11月24日 06:00/)).toBeInTheDocument();
  });
});
