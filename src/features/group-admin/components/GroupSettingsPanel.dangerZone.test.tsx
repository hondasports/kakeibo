import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "./GroupSettingsPanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { GroupDangerZone } from "./GroupDangerZone";
import { GroupSettingsPanel } from "./GroupSettingsPanel";
import {
  cancelPendingGroupInvitationMock,
  changeMemberRoleMock,
  deleteGroupMock,
  navigateMock,
  removeMemberMock,
  transferGroupOwnershipMock,
  useQueryMock,
} from "./GroupSettingsPanelTestMocks";

describe("GroupSettingsPanel（危険操作）", () => {
  it("メンバーには招待管理と危険な操作セクションを表示しない", () => {
    useQueryMock.mockImplementation((reference: string) => {
      if (typeof reference === "string" && reference.includes("groups.queries.getMyGroup")) {
        return {
          _id: "group-001",
          name: "佐藤家",
          role: "member",
          createdAt: 1000,
        };
      }
      if (typeof reference === "string" && reference.includes("groups.queries.listMyGroups")) {
        return [{ _id: "group-001", name: "佐藤家", role: "member", isActive: true }];
      }
      if (typeof reference === "string" && reference.includes("groups.queries.getGroupMembers")) {
        return [
          {
            userId: "https://issuer.example|owner-clerk-id",
            role: "owner",
            displayName: "オーナー",
            email: "owner@example.com",
            createdAt: 1000,
          },
          {
            userId: "user-member",
            role: "member",
            displayName: "メンバー",
            email: "member@example.com",
            createdAt: 1000,
          },
        ];
      }
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByRole("heading", { level: 3, name: "グループ情報" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "メンバー管理" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "招待管理" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "管理操作ログ" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "危険な操作" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("グループ名")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "招待するメールアドレス" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("招待と削除はオーナーのみ操作できます。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /をグループから外す/ })).not.toBeInTheDocument();
  });
  it("メンバー削除前に確認ダイアログを表示し、確定後に mutation を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupDangerZone />);

    await user.click(screen.getByRole("button", { name: "危険な操作" }));

    await user.click(screen.getByRole("button", { name: "メンバーをグループから外す" }));

    expect(
      screen.getByRole("heading", { name: "メンバーをグループから外しますか？" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Clerk アカウント自体は削除されず/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "グループから外す" }));

    await waitFor(() => {
      expect(removeMemberMock).toHaveBeenCalledWith({ targetUserId: "user-member" });
    });
  });
  it("ロール変更前に確認ダイアログを表示し、確定後に mutation を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupSettingsPanel />);

    await user.click(
      within(screen.getByTestId("group-member-role-select-user-member")).getByRole("combobox"),
    );
    await user.click(await screen.findByRole("option", { name: "オーナー" }));

    expect(
      screen.getByRole("heading", { name: "メンバーのロールを変更しますか？" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/「メンバー」から「オーナー」/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ロールを変更する" }));

    await waitFor(() => {
      expect(changeMemberRoleMock).toHaveBeenCalledWith({
        targetUserId: "user-member",
        newRole: "owner",
      });
    });
  });
  it("グループ削除前に影響範囲と確認用グループ名入力を表示し、一致後に mutation を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupDangerZone />);

    await user.click(screen.getByRole("button", { name: "危険な操作" }));

    await user.click(screen.getByTestId("delete-group-request-button"));

    expect(screen.getByRole("heading", { name: "グループを削除しますか？" })).toBeInTheDocument();
    expect(screen.getByText(/削除対象: 佐藤家/)).toBeInTheDocument();
    expect(screen.getByText(/所属メンバー: 2件/)).toBeInTheDocument();
    expect(screen.getByText(/支出\/収入データ: 3件/)).toBeInTheDocument();
    expect(screen.getByText(/取り込み元ドキュメント: 100件以上/)).toBeInTheDocument();
    expect(screen.getByText(/添付画像: 件数は削除処理中に確定します/)).toBeInTheDocument();
    expect(screen.getByText(/管理操作の監査ログ: 5件/)).toBeInTheDocument();
    expect(screen.getByText(/実行後すぐに利用できなくなります/)).toBeInTheDocument();
    expect(screen.getByText(/users と Clerk アカウントは削除されません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除を開始する" })).toBeDisabled();

    await user.type(screen.getByLabelText("確認用グループ名"), "佐藤家");
    await user.click(screen.getByRole("button", { name: "削除を開始する" }));

    await waitFor(() => {
      expect(deleteGroupMock).toHaveBeenCalledWith({ confirmationGroupName: "佐藤家" });
      expect(navigateMock).toHaveBeenCalledWith("/group/delete/status/job-001", {
        flushSync: true,
        replace: true,
      });
    });
  });
  it("グループ削除previewの通信errorをdialog内に表示する", async () => {
    const defaultQuery = useQueryMock.getMockImplementation();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    useQueryMock.mockImplementation((reference: string, args?: unknown) => {
      if (reference.includes("groups.deletion.getGroupDeletionPreview") && args !== "skip") {
        throw new Error("network error");
      }
      return defaultQuery?.(reference, args);
    });
    try {
      const user = userEvent.setup();
      renderWithProviders(<GroupDangerZone />);
      await user.click(screen.getByRole("button", { name: "危険な操作" }));
      await user.click(screen.getByTestId("delete-group-request-button"));
      expect(
        screen.getByText(
          "削除対象の影響範囲を読み込めませんでした。戻ってからもう一度お試しください。",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "削除を開始する" })).toBeDisabled();
    } finally {
      consoleError.mockRestore();
    }
  });
  it("オーナー権限譲渡前に確認ダイアログを表示し、確定後に mutation を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupDangerZone />);

    await user.click(screen.getByRole("button", { name: "危険な操作" }));

    await user.click(
      within(screen.getByTestId("ownership-transfer-target-select")).getByRole("combobox"),
    );
    await user.click(await screen.findByRole("option", { name: "メンバー" }));
    await user.click(screen.getByTestId("ownership-transfer-request-button"));

    expect(
      screen.getByRole("heading", { name: "オーナー権限を譲渡しますか？" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/現在のオーナー: ログイン 太郎/)).toBeInTheDocument();
    expect(screen.getByText(/譲渡先: メンバー/)).toBeInTheDocument();
    expect(screen.getByText(/譲渡後のあなたのロール: メンバー/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "オーナー権限を譲渡する" }));

    await waitFor(() => {
      expect(transferGroupOwnershipMock).toHaveBeenCalledWith({
        targetUserId: "user-member",
      });
    });
  });
  it("招待取り消し前に確認ダイアログを表示し、確定後に action を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupSettingsPanel />);

    await user.click(screen.getByRole("button", { name: "pending@example.comへの招待を取り消す" }));

    expect(screen.getByRole("heading", { name: "招待を取り消しますか？" })).toBeInTheDocument();
    expect(screen.getByText(/招待リンクは無効になり/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "招待を取り消す" }));

    await waitFor(() => {
      expect(cancelPendingGroupInvitationMock).toHaveBeenCalledWith({
        invitationId: "invite-001",
      });
    });
  });
});
