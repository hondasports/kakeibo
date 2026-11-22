import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ExpenseBulkDeleteDialog } from "./ExpenseBulkDeleteDialog";

describe("ExpenseBulkDeleteDialog", () => {
  it("件数と取り消し不可を示して削除を確定する", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    renderWithProviders(
      <ExpenseBulkDeleteDialog
        open
        saving={false}
        selectedCount={3}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("heading", { name: "明細3件を削除しますか？" })).toBeInTheDocument();
    expect(
      screen.getByText("削除すると元に戻せません。今週の集計からも外れます。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "削除する" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
