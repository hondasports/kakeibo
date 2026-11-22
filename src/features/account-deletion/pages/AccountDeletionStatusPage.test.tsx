import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { AccountDeletionStatusPage } from "./AccountDeletionStatusPage";

const { useConvexAuthMock, useMutationMock, useNavigateMock, useQueryMock } = vi.hoisted(() => ({
  useConvexAuthMock: vi.fn(),
  useMutationMock: vi.fn(),
  useNavigateMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: useConvexAuthMock,
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: useNavigateMock };
});

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    accountDeletion: {
      getMyAccountDeletionStatus: "account-deletion-status",
      retryAccountDeletion: "retry-account-deletion",
    },
  },
}));

describe("AccountDeletionStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useMutationMock.mockReturnValue(vi.fn());
    useNavigateMock.mockReturnValue(vi.fn());
    useQueryMock.mockReturnValue(undefined);
  });

  it("認証済みなら削除ステータスを問い合わせる", () => {
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(useQueryMock).toHaveBeenCalledWith("account-deletion-status", {});
  });

  it("認証確認中は読み込み表示にする", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(screen.getByRole("status", { name: "ログイン状態を確認中" })).toBeInTheDocument();
  });

  it("未認証が確定したらログインし直しの案内を表示する", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(useQueryMock).toHaveBeenCalledWith("account-deletion-status", "skip");
    expect(screen.getByRole("heading", { name: "ログインが必要です" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ホームへ戻る" })).toBeInTheDocument();
  });

  it("退会要求がないときは見つからない旨と設定への導線を表示する", () => {
    useQueryMock.mockReturnValue(null);
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(
      screen.getByRole("heading", { name: "アカウント削除の要求が見つかりません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定に戻る" })).toBeInTheDocument();
  });

  it("処理中はページを閉じても続くことと完了メールの案内を表示する", () => {
    useQueryMock.mockReturnValue({ status: "purging_groups", nextRetryAt: null });
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(
      screen.getByRole("heading", { name: "グループデータを削除しています" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ページを閉じても処理は続きます/)).toBeInTheDocument();
    expect(screen.getByText(/メールアドレスへお知らせします/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定に戻る" })).toBeInTheDocument();
  });

  it("identity_deleted では残り処理の案内を表示する", () => {
    useQueryMock.mockReturnValue({ status: "identity_deleted", nextRetryAt: null });
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(
      screen.getByRole("heading", { name: "ログイン情報の削除が完了しました" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ログイン情報は削除済みです/)).toBeInTheDocument();
  });
});
