import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SystemAdminMembershipChangeDialog } from "./SystemAdminMembershipChangeDialog";

const target = {
  id: "user-1",
  displayName: "対象",
  email: "target@example.test",
  activeGroupId: "group-a",
};

describe("SystemAdminMembershipChangeDialog", () => {
  it("reasonの境界と家計データ非移動の説明を表示し、500文字で実行できる", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SystemAdminMembershipChangeDialog
        confirming={false}
        currentRole="member"
        environment="preview"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
        operation="transfer"
        sourceGroup={{ id: "group-a", name: "A" }}
        target={target}
        targetGroup={{ id: "group-b", name: "B" }}
      />,
    );

    expect(screen.getByText(/家計データは移動しません/)).toBeInTheDocument();
    const reason = screen.getByLabelText("操作理由");
    await user.type(reason, "理由");
    expect(screen.getByRole("button", { name: "実行する" })).toBeEnabled();
    fireEvent.change(reason, { target: { value: "a".repeat(501) } });
    expect(screen.getByRole("button", { name: "実行する" })).toBeDisabled();
    fireEvent.change(reason, { target: { value: "a".repeat(500) } });
    await user.click(screen.getByRole("button", { name: "実行する" }));
    expect(onConfirm).toHaveBeenCalledWith("a".repeat(500));
  });

  it("role変更とowner付替えの対象を明示する", () => {
    const { rerender } = render(
      <SystemAdminMembershipChangeDialog
        confirming={false}
        currentRole="member"
        environment="preview"
        newRole="owner"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        operation="role_change"
        sourceGroup={{ id: "group-a", name: "A" }}
        target={target}
      />,
    );
    expect(screen.getByRole("heading", { name: "ownerへ昇格を確認" })).toBeInTheDocument();
    expect(
      screen.getByText(/対象グループ: A（group-a） \/ role: メンバー → オーナー/),
    ).toBeInTheDocument();

    rerender(
      <SystemAdminMembershipChangeDialog
        confirming={false}
        environment="preview"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        operation="owner_transfer"
        sourceUser={{ id: "owner-1", displayName: "元owner", email: "owner@example.test" }}
        target={target}
      />,
    );
    expect(screen.getByRole("heading", { name: "owner付替えを確認" })).toBeInTheDocument();
    expect(screen.getByText(/付替え元: 元owner/)).toBeInTheDocument();
  });
});
