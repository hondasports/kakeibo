import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useGroupMembershipMock, useConvexAuthMock, useQueryMock } = vi.hoisted(() => ({
  useGroupMembershipMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

function Page({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

vi.mock("convex/react", () => ({
  useConvexAuth: useConvexAuthMock,
  useQuery: useQueryMock,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

vi.mock("./features/group-admin", () => ({
  useGroupMembership: useGroupMembershipMock,
  GroupInvitationAcceptPage: Page,
  GroupDeletionStatusPage: Page,
  GroupSelectPage: Page,
  GroupSetupPage: Page,
}));

vi.mock("./features/app-shell", () => ({
  AppLayout: () => <div data-testid="app-layout" />,
  GuidePage: Page,
  MaintenancePage: Page,
  MonthlySummaryRouteFallback: Page,
  YearlySummaryRouteFallback: Page,
  NotFoundPage: Page,
  PrivacyPolicyPage: Page,
  TermsPage: Page,
  UpdatesPage: Page,
}));

vi.mock("./features/ui", () => ({
  SuzumemoLoadingState: ({ label, message }: { label: string; message: string }) => (
    <div data-testid="loading">
      {label}:{message}
    </div>
  ),
}));

vi.mock("./features/dashboard", () => ({ DashboardPage: Page }));
vi.mock("./features/expense-entry", () => ({ InputPage: Page }));
vi.mock("./features/settings", () => ({ SettingsPage: Page }));
vi.mock("./features/settings/pages/LineLinkCallbackPage", () => ({ LineLinkCallbackPage: Page }));
vi.mock("./features/account-deletion", () => ({
  AccountDeletionPage: Page,
  AccountDeletionStatusPage: Page,
}));
vi.mock("./routing/e2eRoutes", () => ({
  e2eRoutes: [],
  shouldEnableE2eRoutes: () => false,
}));
vi.mock("./features/system-admin", () => ({
  SystemAdminGroupDetailPage: Page,
  SystemAdminGroupDeletionPage: Page,
  SystemAdminGroupSearchPage: Page,
  SystemAdminHomePage: Page,
  SystemAdminAuditLogPage: Page,
  SystemAdminManagementPage: Page,
  SystemAdminRouteGuard: Page,
  SystemAdminUserDetailPage: Page,
  SystemAdminUserSearchPage: Page,
}));
vi.mock("../convex/_generated/api", () => ({
  api: {
    accountDeletion: { getMyAccountDeletionStatus: "account-deletion-status" },
  },
}));

import { GroupRouteGuard } from "./router";

describe("GroupRouteGuard", () => {
  beforeEach(() => {
    useGroupMembershipMock.mockReturnValue({
      hasGroups: true,
      needsSelection: false,
      isLoading: false,
    });
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQueryMock.mockReturnValue(null);
  });

  it("認証・グループ情報の読み込み中はローディングを表示する", () => {
    useGroupMembershipMock.mockReturnValue({
      hasGroups: false,
      needsSelection: false,
      isLoading: true,
    });
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("loading")).toHaveTextContent("グループ情報を確認中");
  });

  it("認証済みの削除状態未取得中もローディングを表示する", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQueryMock.mockReturnValue(undefined);
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("loading")).toHaveTextContent("グループ情報を確認中");
  });

  it("削除状態があれば削除ステータスへ遷移する", () => {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQueryMock.mockReturnValue({ status: "deleting" });
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/settings/account/delete/status");
  });

  it("グループ未作成ならセットアップへ遷移する", () => {
    useGroupMembershipMock.mockReturnValue({
      hasGroups: false,
      needsSelection: false,
      isLoading: false,
    });
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/group/setup");
  });

  it("選択待ちならグループ選択へ遷移する", () => {
    useGroupMembershipMock.mockReturnValue({
      hasGroups: true,
      needsSelection: true,
      isLoading: false,
    });
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/group/select");
  });

  it("利用可能な状態ならアプリレイアウトを表示する", () => {
    render(<GroupRouteGuard />);

    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
  });
});
