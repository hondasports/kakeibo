import { ConvexError } from "convex/values";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { getDetail, operate } = vi.hoisted(() => ({ getDetail: vi.fn(), operate: vi.fn() }));
vi.mock("convex/react", () => ({
  useAction: () => getDetail,
  useMutation: () => operate,
}));

import { SystemAdminUserDetailPage } from "./SystemAdminUserDetailPage";

describe("SystemAdminUserDetailPage", () => {
  it("本人へのactive設定が拒否された理由をダイアログに表示する", async () => {
    const user = userEvent.setup();
    const message = "自分自身の所属追加・移動・activeグループ設定はできません";
    getDetail.mockResolvedValue({
      id: "admin-doc",
      userId: "admin",
      displayName: "管理者",
      email: null,
      activeGroupId: null,
      environment: "preview",
      memberships: [{ groupId: "group-a", groupName: "A", role: "member" }],
      invitations: [],
    });
    operate.mockRejectedValue(new ConvexError(message));
    render(
      <MemoryRouter initialEntries={["/admin/users/admin-doc"]}>
        <Routes>
          <Route path="/admin/users/:userId" element={<SystemAdminUserDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "activeに設定" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("操作理由"), "所属先を選択");
    await user.click(within(dialog).getByRole("button", { name: "実行する" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).getByRole("button", { name: "戻る" })).toBeEnabled();
    expect(operate).toHaveBeenCalledWith({
      targetUserId: "admin-doc",
      operation: "set_active",
      sourceGroupId: undefined,
      targetGroupId: "group-a",
      reason: "所属先を選択",
    });
    expect(screen.queryByText(/操作を完了しました/)).not.toBeInTheDocument();
  });
});
