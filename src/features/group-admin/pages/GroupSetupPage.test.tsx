import { MemoryRouter } from "react-router-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { GroupSetupPage } from "./GroupSetupPage";

const { createGroupMock, signOutMock, useGroupMembershipMock, useMutationMock, useNavigateMock } =
  vi.hoisted(() => ({
    createGroupMock: vi.fn(),
    signOutMock: vi.fn(),
    useGroupMembershipMock: vi.fn(),
    useMutationMock: vi.fn(),
    useNavigateMock: vi.fn(),
  }));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    groups: {
      mutations: {
        createGroup: "groups.mutations.createGroup",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
}));

vi.mock("@clerk/react", () => ({
  useClerk: () => ({ signOut: signOutMock }),
}));

vi.mock("../hooks/useGroupMembership", () => ({
  useGroupMembership: () => useGroupMembershipMock(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
    useNavigate: useNavigateMock,
  };
});

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <GroupSetupPage />
    </MemoryRouter>,
  );
}

describe("GroupSetupPage", () => {
  beforeEach(() => {
    createGroupMock.mockReset();
    signOutMock.mockReset();
    useGroupMembershipMock.mockReset();
    useMutationMock.mockReset();
    useNavigateMock.mockReset();

    createGroupMock.mockResolvedValue("group-001");
    useGroupMembershipMock.mockReturnValue({ hasGroups: false, isLoading: false });
    useMutationMock.mockImplementation((mutationRef: string) => {
      if (mutationRef.includes("groups.mutations.createGroup")) return createGroupMock;
      return vi.fn();
    });
    useNavigateMock.mockReturnValue(vi.fn());
  });

  it("グループ未所属なら作成フォームを表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "グループを作成" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "グループ名" })).toBeInTheDocument();
  });

  it("グループ作成後にホームへ遷移する", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);
    renderPage();

    await user.type(screen.getByRole("textbox", { name: "グループ名" }), "佐藤家");
    await user.click(screen.getByRole("button", { name: "グループを作成" }));

    expect(createGroupMock).toHaveBeenCalledWith({ name: "佐藤家" });
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("空のグループ名で送信すると項目直下にエラーを表示する", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "グループを作成" }));

    expect(createGroupMock).not.toHaveBeenCalled();
    expect(screen.getByText("グループ名を入力してください。")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "グループ名" }), "佐藤家");
    expect(screen.queryByText("グループ名を入力してください。")).not.toBeInTheDocument();
  });

  it("入力中にグループ名の文字数上限が分かる", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("0 / 50文字")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "グループ名" }), "佐藤家");
    expect(screen.getByText("3 / 50文字")).toBeInTheDocument();
  });

  it("グループ未所属ではログアウトの導線を表示する", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });

  it("所属グループがある場合はグループ選択へ戻る導線を表示する", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);
    useGroupMembershipMock.mockReturnValue({ hasGroups: true, isLoading: false });
    renderPage();

    await user.click(screen.getByRole("button", { name: "グループ選択へ戻る" }));

    expect(navigate).toHaveBeenCalledWith("/group/select");
  });
});
