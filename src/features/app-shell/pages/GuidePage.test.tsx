import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuidePage } from "./GuidePage";

function renderGuide() {
  return render(
    <MemoryRouter>
      <GuidePage />
    </MemoryRouter>,
  );
}

describe("GuidePage", () => {
  it("主要な使い方セクションを短い説明付きで表示する", () => {
    renderGuide();

    expect(screen.getByRole("heading", { name: "使い方", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "まずやること", level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "支出・収入を入力する", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "レシートから入力する", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "月次サマリーを見る", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "履歴を検索する", level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "週次サマリーを見る", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "年次サマリーを見る", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "カテゴリと設定を管理する", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "グループで共有する", level: 2 }),
    ).toBeInTheDocument();
  });

  it("主要画面への導線を提供する", () => {
    renderGuide();

    expect(screen.getByRole("link", { name: "入力を始める" })).toHaveAttribute(
      "href",
      "/weeks/current/input",
    );
    expect(screen.getByRole("link", { name: "検索を開く" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "設定を開く" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
  });

  it("手順は順序付きリストとしてマークアップされている", () => {
    renderGuide();

    const steps = screen.getAllByRole("list");
    expect(steps.length).toBeGreaterThan(0);
    for (const stepList of steps) {
      expect(stepList.tagName).toBe("OL");
      for (const item of within(stepList).getAllByRole("listitem")) {
        expect(item.textContent).not.toMatch(/^\d+\./);
      }
    }
  });
});
