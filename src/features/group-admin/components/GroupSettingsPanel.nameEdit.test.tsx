import { fireEvent, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import "./GroupSettingsPanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { GroupSettingsPanel } from "./GroupSettingsPanel";
import { updateGroupNameMock, useQueryMock } from "./GroupSettingsPanelTestMocks";

describe("GroupSettingsPanel（グループ名管理）", () => {
  it("単一グループのオーナーはグループ名変更フォームを表示する", () => {
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
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getByLabelText("グループ名")).toHaveValue("佐藤家");
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.queryByLabelText("現在のグループ")).not.toBeInTheDocument();
  });
  it("単一グループのオーナーはグループ名を保存できる", async () => {
    const user = userEvent.setup();
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
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    const nameInput = screen.getByLabelText("グループ名");
    fireEvent.change(nameInput, { target: { value: "鈴木家" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateGroupNameMock).toHaveBeenCalledWith({ name: "鈴木家" });
    });
    expect(screen.getByText("グループ名を更新しました")).toBeInTheDocument();
  });
  it("グループ名が空のときは保存せずエラーを表示する", async () => {
    const user = userEvent.setup();
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
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    const nameInput = screen.getByLabelText("グループ名");
    fireEvent.change(nameInput, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("グループ名を入力してください。")).toBeInTheDocument();
    expect(updateGroupNameMock).not.toHaveBeenCalled();
  });
  it("単一グループのメンバーはグループ名テキストを表示する", () => {
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
        ];
      }
      return [];
    });

    renderWithProviders(<GroupSettingsPanel />);

    expect(screen.getAllByText("佐藤家")).toHaveLength(2);
    expect(screen.queryByLabelText("グループ名")).not.toBeInTheDocument();
  });
});
