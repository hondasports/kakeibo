import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { AccountDeletionErrorBoundary } from "./AccountDeletionErrorBoundary";

describe("AccountDeletionErrorBoundary", () => {
  it("再試行で子を描画し直し、回復すれば内容が見える", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw new Error("query failed");
      }
      return <div>回復した内容</div>;
    }

    renderWithProviders(
      <AccountDeletionErrorBoundary>
        <FlakyChild />
      </AccountDeletionErrorBoundary>,
    );

    expect(screen.getByText(/退会情報を読み込めませんでした/)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(screen.getByText("回復した内容")).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
