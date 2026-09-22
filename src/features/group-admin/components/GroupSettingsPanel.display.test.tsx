import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import "./GroupSettingsPanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { GroupSettingsPanel } from "./GroupSettingsPanel";
import { inviteMemberMock, useQueryMock, useUserMock } from "./GroupSettingsPanelTestMocks";

describe("GroupSettingsPanel（表示）", () => {
  it("複数グループがあると切替 UI を表示する", () => {
    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByRole("heading", { name: "グループ", level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText("現在のグループ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切り替え" })).toBeInTheDocument();
  });
  it("設定台帳では概要を先に表示し、管理UIを展開できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupSettingsPanel defaultExpanded={false} />);

    const trigger = screen.getByRole("button", { name: "管理する" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "group-management-content");
    expect(screen.getByText(/2人・オーナー・保留中の招待 1件/)).toBeInTheDocument();
    expect(screen.queryByTestId("group-info-section")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("group-info-section")).toBeInTheDocument();
    expect(screen.queryByTestId("danger-zone-section")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /をグループから外す/ })).not.toBeInTheDocument();
  });
  it("メールアドレスを入力して招待を送れる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GroupSettingsPanel />);

    await user.type(
      screen.getByRole("textbox", { name: "招待するメールアドレス" }),
      "member@example.com",
    );
    await user.click(screen.getByRole("button", { name: "招待を送る" }));

    await waitFor(() => {
      expect(inviteMemberMock).toHaveBeenCalledWith({
        email: "member@example.com",
        redirectUrl: expect.stringContaining("/group/invitations/accept"),
      });
    });
  });
  it("現在のグループとメンバー一覧を表示する", () => {
    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByLabelText("現在のグループ")).toBeInTheDocument();
    expect(screen.getByText("ログイン 太郎")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("あなた")).toBeInTheDocument();
    expect(screen.getAllByText("オーナー").length).toBeGreaterThan(0);
    expect(screen.getAllByText("メンバー").length).toBeGreaterThan(0);
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
  });
  it("ログイン中ユーザーの fullName がない場合は username を表示する", () => {
    useUserMock.mockReturnValue({
      user: {
        fullName: null,
        username: "friendly-owner",
        firstName: "名",
        lastName: "姓",
        primaryEmailAddress: { emailAddress: "owner@example.com" },
      },
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByText("friendly-owner")).toBeInTheDocument();
    expect(screen.queryByText("名 姓")).not.toBeInTheDocument();
  });
  it("ログイン中ユーザーの username がない場合は firstName と lastName を結合して表示する", () => {
    useUserMock.mockReturnValue({
      user: {
        fullName: null,
        username: null,
        firstName: "名",
        lastName: "姓",
        primaryEmailAddress: { emailAddress: "owner@example.com" },
      },
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByText("名 姓")).toBeInTheDocument();
  });
  it("表示名が未設定ならメールアドレスを主表示に使う", () => {
    useQueryMock.mockImplementation((reference: string) => {
      if (typeof reference === "string" && reference.includes("groups.queries.getMyGroup")) {
        return {
          _id: "group-001",
          name: "佐藤家",
          role: "owner",
          createdAt: 1000,
        };
      }
      if (typeof reference === "string" && reference.includes("groups.queries.listMyGroups")) {
        return [{ _id: "group-001", name: "佐藤家", role: "owner", isActive: true }];
      }
      if (typeof reference === "string" && reference.includes("groups.queries.getGroupMembers")) {
        return [
          {
            userId: "user-member",
            role: "member",
            displayName: "ユーザー",
            email: "member@example.com",
            createdAt: 1000,
          },
        ];
      }
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("メール登録済み")).toBeInTheDocument();
  });
  it("オーナー向けにグループ管理の各セクションを順序どおり表示する", () => {
    renderWithProviders(<GroupSettingsPanel />);

    const sectionTitles = ["グループ情報", "メンバー管理", "招待管理", "管理操作ログ"];
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(sectionTitles);

    expect(screen.getByTestId("group-info-section")).toBeInTheDocument();
    expect(screen.getByTestId("member-management-section")).toBeInTheDocument();
    expect(screen.getByTestId("invite-management-section")).toBeInTheDocument();
    expect(screen.getByTestId("management-audit-log-section")).toBeInTheDocument();
    expect(screen.queryByTestId("danger-zone-section")).not.toBeInTheDocument();
    expect(screen.getByLabelText("グループ名")).toHaveValue("佐藤家");
    expect(screen.getByTestId("group-pending-invitation-list")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByText("招待中")).toBeInTheDocument();
    expect(screen.getByText("グループ名を変更")).toBeInTheDocument();
    expect(screen.getByText("佐藤家 → 鈴木家")).toBeInTheDocument();
  });
  it("pending 招待がない場合は空状態を表示する", () => {
    useQueryMock.mockImplementation((reference: string) => {
      if (typeof reference === "string" && reference.includes("groups.queries.getMyGroup")) {
        return {
          _id: "group-001",
          name: "佐藤家",
          role: "owner",
          createdAt: 1000,
        };
      }
      if (typeof reference === "string" && reference.includes("groups.queries.listMyGroups")) {
        return [{ _id: "group-001", name: "佐藤家", role: "owner", isActive: true }];
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
        ];
      }
      if (
        typeof reference === "string" &&
        reference.includes("groups.queries.listPendingGroupInvitations")
      ) {
        return [];
      }
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByTestId("group-pending-invitation-list-empty")).toHaveTextContent(
      "送信済みの招待はありません。",
    );
  });
  it("複数グループのオーナーも切替とグループ名変更へ到達できる", () => {
    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByLabelText("現在のグループ")).toBeInTheDocument();
    expect(screen.getByLabelText("グループ名")).toHaveValue("佐藤家");
  });
  it("セクション見出しは aria-labelledby で関連付けられる", () => {
    renderWithProviders(<GroupSettingsPanel />);

    const groupInfoSection = screen.getByTestId("group-info-section");
    expect(groupInfoSection).toHaveAttribute("aria-labelledby", "group-info-section-heading");
    expect(screen.getByRole("heading", { level: 3, name: "グループ情報" })).toHaveAttribute(
      "id",
      "group-info-section-heading",
    );
  });
});
