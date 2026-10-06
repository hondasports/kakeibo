import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "./SettingsPage";

vi.mock("../components/CategorySettingsPanel", () => ({
  CategorySettingsPanel: () => <h2>カテゴリ</h2>,
}));

vi.mock("../../group-admin", () => ({
  GroupDangerZone: () => <h2>危険な操作</h2>,
  GroupSettingsPanel: () => <h2>グループ</h2>,
  GroupSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../components/WeekDaySettingsPanel", () => ({
  WeekDaySettingsPanel: () => <h2>週の設定</h2>,
}));

vi.mock("../components/NotificationSettingsPanel", () => ({
  NotificationSettingsPanel: () => <h2>通知設定</h2>,
}));

vi.mock("../components/LineLinkSettingsPanel", () => ({
  LineLinkSettingsPanel: () => <h2>LINE連携</h2>,
}));

describe("SettingsPage", () => {
  it("h1 見出し「設定」が表示される", () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "設定", level: 1 })).toBeInTheDocument();
  });

  it("単一の設定台帳に説明と4セクションを順番どおり表示する", () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("グループやカテゴリ、週の設定を確認・管理します。"),
    ).toBeInTheDocument();

    const ledger = screen.getByTestId("settings-ledger");
    expect(ledger.querySelectorAll(":scope > .settings-ledger-section")).toHaveLength(7);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      "グループ",
      "カテゴリ",
      "週の設定",
      "通知設定",
      "LINE連携",
      "アカウント",
      "危険な操作",
    ]);
  });
});
