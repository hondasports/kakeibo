import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { apiMockWith } from "../../../test/apiMock";
import { AccountDeletionPage } from "./AccountDeletionPage";

const { useMutationMock, useNavigateMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useNavigateMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: useNavigateMock };
});

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "accountDeletion.getAccountDeletionPreview": "account-deletion-preview",
    "accountDeletion.requestAccountDeletion": "request-account-deletion",
    "groups.mutations.setActiveGroup": "set-active-group",
  }),
}));

const previewWith = (overrides: Record<string, unknown>) => ({
  canDelete: true,
  errorCode: null,
  groupsToLeave: [],
  groupsToDelete: [],
  blockingGroups: [],
  ...overrides,
});

describe("AccountDeletionPage", () => {
  const requestDeletion = vi.fn();
  const setActiveGroup = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requestDeletion.mockResolvedValue("request-id");
    setActiveGroup.mockResolvedValue(undefined);
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "request-account-deletion" ? requestDeletion : setActiveGroup,
    );
    useNavigateMock.mockReturnValue(navigate);
  });

  it("preview読み込み中はローディングを表示する", () => {
    useQueryMock.mockReturnValue(undefined);
    renderWithProviders(<AccountDeletionPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("唯一ownerのブロックグループを表示し、設定画面への導線でそのグループを開く", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(
      previewWith({
        canDelete: false,
        blockingGroups: [
          {
            groupId: "group-blocked",
            groupName: "宮本家",
            memberCount: 2,
            reason: "sole_owner_with_other_members",
          },
        ],
      }),
    );

    renderWithProviders(<AccountDeletionPage />);

    expect(screen.getByRole("heading", { name: "アカウントを削除できません" })).toBeInTheDocument();
    expect(screen.getByText("宮本家")).toBeInTheDocument();
    expect(screen.getByText("唯一のオーナーです・メンバー 2人")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "グループ設定を開く" }));
    expect(setActiveGroup).toHaveBeenCalledWith({ groupId: "group-blocked" });
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("GROUP_MEMBERSHIP_INVARIANT のときサポート案内を表示する", () => {
    useQueryMock.mockReturnValue(
      previewWith({ canDelete: false, errorCode: "GROUP_MEMBERSHIP_INVARIANT" }),
    );

    renderWithProviders(<AccountDeletionPage />);

    expect(screen.getByRole("heading", { name: "アカウントを削除できません" })).toBeInTheDocument();
    expect(screen.getByText(/サポートへお問い合わせください/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "アカウントを削除する" })).not.toBeInTheDocument();
  });

  it("離脱・削除対象グループの一覧を表示し、確認文言「削除」の入力後にだけ退会を開始できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(
      previewWith({
        groupsToLeave: [{ groupId: "group-leave", groupName: "実家", role: "member" }],
        groupsToDelete: [{ groupId: "group-delete", groupName: "自分だけ" }],
      }),
    );

    renderWithProviders(<AccountDeletionPage />);

    expect(screen.getByRole("heading", { name: "アカウントを削除します" })).toBeInTheDocument();
    expect(screen.getByText("・実家")).toBeInTheDocument();
    expect(screen.getByText("・自分だけ")).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: "アカウントを削除する" });
    expect(deleteButton).toBeDisabled();

    const input = screen.getByRole("textbox", { name: "確認用入力" });
    await user.type(input, "削");
    expect(deleteButton).toBeDisabled();
    await user.type(input, "除");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    expect(requestDeletion).toHaveBeenCalledWith({ confirmationText: "削除" });
    expect(navigate).toHaveBeenCalledWith("/settings/account/delete/status", { replace: true });
  });

  it("退会開始が失敗したらエラーを表示して再試行できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    requestDeletion.mockRejectedValueOnce(new Error("server error"));

    renderWithProviders(<AccountDeletionPage />);

    await user.type(screen.getByRole("textbox", { name: "確認用入力" }), "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(await screen.findByText(/アカウント削除を開始できませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アカウントを削除する" })).toBeEnabled();
  });
});
