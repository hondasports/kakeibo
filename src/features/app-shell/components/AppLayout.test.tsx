import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { getCurrentWeekStartDate } from "../../week";
import { AppLayout } from "./AppLayout";

const { useClerkMock, useUserMock, useMediaQueryMock } = vi.hoisted(() => ({
  useClerkMock: vi.fn(),
  useUserMock: vi.fn(),
  useMediaQueryMock: vi.fn(),
}));
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/react", () => ({
  useClerk: useClerkMock,
  useUser: useUserMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => <div>Outlet</div>,
  useLocation: () => ({ pathname: "/" }),
  useNavigation: () => ({ location: undefined, state: "idle" }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("@mui/material", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mui/material")>();
  return {
    ...actual,
    useMediaQuery: useMediaQueryMock,
  };
});

describe("AppLayout サイドバー開閉", () => {
  beforeEach(() => {
    useClerkMock.mockReturnValue({
      openUserProfile: vi.fn(),
      signOut: vi.fn(),
    });
    useUserMock.mockReturnValue({ user: null });
    useQueryMock.mockReturnValue({ weeklyStartDay: 1 });
  });

  describe("PC表示（isPC=true）", () => {
    beforeEach(() => {
      useMediaQueryMock.mockReturnValue(true);
    });

    it("初期状態でサイドバーが開いており、ChevronLeftアイコン付きの閉じるボタンが表示される", () => {
      renderWithProviders(<AppLayout />);

      // サイドメニューが表示されている
      expect(screen.getByLabelText("サイドメニュー")).toBeInTheDocument();
      // ChevronLeft（閉じる）アイコン付きのトグルボタンが存在する
      expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeInTheDocument();
    });

    it("閉じるボタンをクリックするとナビラベルが非表示になりChevronRightアイコンに切り替わる", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AppLayout />);

      await user.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));

      // サイドメニューのナビラベルがDOMから取り除かれる（ヘッダーの画面名は残る）
      const drawer = screen.getByLabelText("サイドメニュー");
      expect(within(drawer).queryByText("ホーム")).not.toBeInTheDocument();
      // ドロワーを畳むとヘッダーにブランドと画面名が出る
      expect(screen.getByText("ホーム")).toBeInTheDocument();
      // アイコンがChevronRight（開く）に切り替わる
      expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeInTheDocument();
    });

    it("閉じた後に開くボタンをクリックするとサイドバーが復元される", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AppLayout />);

      await user.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
      await user.click(screen.getByRole("button", { name: "サイドバーを開く" }));

      // ナビラベルがDOMに再表示される
      expect(screen.getByText("ホーム")).toBeInTheDocument();
      // 閉じるボタンに戻る
      expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeInTheDocument();
    });

    it("履歴リンクにユーザーの週開始曜日を反映する", () => {
      useQueryMock.mockReturnValue({ weeklyStartDay: 3 });

      renderWithProviders(<AppLayout />);

      expect(screen.getByRole("link", { name: "履歴" })).toHaveAttribute(
        "href",
        `/weeks/${getCurrentWeekStartDate(3)}`,
      );
    });
  });

  describe("スマートフォン表示（isPC=false）", () => {
    beforeEach(() => {
      useMediaQueryMock.mockReturnValue(false);
    });

    it("ボトムナビゲーションが表示され、サイドバー開閉ボタンは存在しない", () => {
      renderWithProviders(<AppLayout />);

      expect(screen.getByLabelText("ボトムナビゲーション")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "サイドバーを閉じる" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "サイドバーを開く" })).not.toBeInTheDocument();
    });

    it("ボトムナビゲーションの各項目にラベルとアイコンが表示される", () => {
      renderWithProviders(<AppLayout />);

      const bottomNavigation = screen.getByLabelText("ボトムナビゲーション");
      for (const label of ["ホーム", "入力", "履歴", "使い方", "設定"]) {
        const link = screen.getByRole("link", { name: label });
        expect(bottomNavigation).toContainElement(link);
        expect(link.querySelector("svg")).toBeInTheDocument();
      }
    });

    it("ヘッダーに履歴検索窓を表示する", () => {
      renderWithProviders(<AppLayout />);

      expect(screen.getByLabelText("履歴を検索")).toBeInTheDocument();
    });

    it("ヘッダーにブランドと現在の画面名を表示する", () => {
      const { container } = renderWithProviders(<AppLayout />);
      const header = container.querySelector("header");

      expect(header).not.toBeNull();
      expect(header!.querySelector('img[src="/suzumemo-app-icon.svg"]')).toBeInTheDocument();
      expect(within(header as HTMLElement).getByText("ホーム")).toBeInTheDocument();
    });
  });
});
