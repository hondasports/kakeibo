import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { NotFoundPage } from "./NotFoundPage";

describe("NotFoundPage", () => {
  it("404メッセージと復帰導線を表示する", () => {
    renderWithProviders(<NotFoundPage />);

    expect(screen.getByText("404 Not Found")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Suzumemo" })).toHaveAttribute(
      "src",
      "/suzumemo-app-icon.svg",
    );
    expect(screen.getByText("スズメモ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ページが見つかりません" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /指定されたページは移動または削除された可能性があります。ホームからもう一度お探しください。/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "プライバシー" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });
});
