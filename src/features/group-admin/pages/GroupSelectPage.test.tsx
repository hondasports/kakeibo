import { MemoryRouter } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { GroupSelectPage } from "./GroupSelectPage";

const { setActiveGroupMock, useNavigateMock, useGroupMembershipMock } = vi.hoisted(() => ({
  setActiveGroupMock: vi.fn(),
  useNavigateMock: vi.fn(),
  useGroupMembershipMock: vi.fn(),
}));

vi.mock("../hooks/useGroupMembership", () => ({
  useGroupMembership: useGroupMembershipMock,
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    groups: {
      mutations: {
        setActiveGroup: "groups.mutations.setActiveGroup",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => setActiveGroupMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: useNavigateMock,
  };
});

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <GroupSelectPage />
    </MemoryRouter>,
  );
}

describe("GroupSelectPage", () => {
  beforeEach(() => {
    setActiveGroupMock.mockReset();
    useNavigateMock.mockReset();
    useGroupMembershipMock.mockReset();
    setActiveGroupMock.mockResolvedValue("group-001");
    useNavigateMock.mockReturnValue(vi.fn());
    useGroupMembershipMock.mockReturnValue({
      group: null,
      groups: [],
      hasGroups: true,
      needsSelection: true,
      isLoading: false,
    });
  });

  it("複数グループを一覧表示する", () => {
    useGroupMembershipMock.mockReturnValue({
      group: null,
      groups: [
        { _id: "group-001", name: "佐藤家", role: "owner", isActive: true, createdAt: 1000 },
        { _id: "group-002", name: "鈴木家", role: "member", isActive: false, createdAt: 2000 },
      ],
      hasGroups: true,
      needsSelection: true,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByRole("heading", { name: "グループを選択" })).toBeInTheDocument();
    expect(screen.getByText("佐藤家")).toBeInTheDocument();
    expect(screen.getByText("鈴木家")).toBeInTheDocument();
    expect(screen.getByText("現在のグループ")).toBeInTheDocument();
  });

  it("グループを切り替えると activeGroup を更新して home へ戻る", async () => {
    const user = userEvent.setup();
    const navigateMock = vi.fn();
    useNavigateMock.mockReturnValue(navigateMock);
    useGroupMembershipMock.mockReturnValue({
      group: null,
      groups: [
        { _id: "group-001", name: "佐藤家", role: "owner", isActive: true, createdAt: 1000 },
        { _id: "group-002", name: "鈴木家", role: "member", isActive: false, createdAt: 2000 },
      ],
      hasGroups: true,
      needsSelection: true,
      isLoading: false,
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "このグループを使う" }));

    await waitFor(() => {
      expect(setActiveGroupMock).toHaveBeenCalledWith({ groupId: "group-002" });
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("切替に失敗するとエラーを表示し、再試行できる", async () => {
    const user = userEvent.setup();
    const navigateMock = vi.fn();
    useNavigateMock.mockReturnValue(navigateMock);
    useGroupMembershipMock.mockReturnValue({
      group: null,
      groups: [
        { _id: "group-001", name: "佐藤家", role: "owner", isActive: true, createdAt: 1000 },
        { _id: "group-002", name: "鈴木家", role: "member", isActive: false, createdAt: 2000 },
      ],
      hasGroups: true,
      needsSelection: true,
      isLoading: false,
    });
    setActiveGroupMock.mockRejectedValueOnce(new Error("network")).mockResolvedValue("group-002");

    renderPage();

    await user.click(screen.getByRole("button", { name: "このグループを使う" }));

    await waitFor(() => {
      expect(
        screen.getByText("グループを切り替えできませんでした。もう一度お試しください。"),
      ).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalledWith("/", { replace: true });

    await user.click(screen.getByRole("button", { name: "このグループを使う" }));
    await waitFor(() => {
      expect(setActiveGroupMock).toHaveBeenCalledTimes(2);
    });
  });
});
