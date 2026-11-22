import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SystemAdminInvitationRevokeDialog } from "./SystemAdminInvitationRevokeDialog";

describe("SystemAdminInvitationRevokeDialog", () => {
  it("group・email・作成日時を確認し、理由付きで取り消す", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SystemAdminInvitationRevokeDialog
        confirming={false}
        environment="preview"
        group={{ id: "group-1", name: "家計グループ" }}
        invitation={{ id: "invitation-1", email: "invitee@example.test", createdAt: 0 }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
      />,
    );
    expect(screen.getByText(/対象グループ: 家計グループ（group-1）/)).toBeInTheDocument();
    expect(screen.getByText(/招待先: invitee@example.test/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("操作理由"), "誤招待");
    await user.click(screen.getByRole("button", { name: "取り消す" }));
    expect(onConfirm).toHaveBeenCalledWith("誤招待");
    expect(screen.queryByText(/token|Clerk/)).not.toBeInTheDocument();
  });
});
