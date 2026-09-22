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

  it("未認証ならクエリを実行せず読み込み表示のままにする", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderWithProviders(<AccountDeletionStatusPage />);

    expect(useQueryMock).toHaveBeenCalledWith("account-deletion-status", "skip");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
