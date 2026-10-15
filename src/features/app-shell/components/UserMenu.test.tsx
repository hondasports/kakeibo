import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "../../../test/render";
import { useSignOutState, setSignOutState } from "../../auth/hooks/signOutState";
import { UserMenu } from "./UserMenu";

const { useClerkMock, useUserMock } = vi.hoisted(() => ({
  useClerkMock: vi.fn(),
  useUserMock: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useClerk: useClerkMock,
  useUser: useUserMock,
}));

describe("UserMenu", () => {
  it("ユーザーメニューに /updates への「更新履歴」リンクを表示する", async () => {
    const user = userEvent.setup();
    useClerkMock.mockReturnValue({
      openUserProfile: vi.fn(),
      signOut: vi.fn(),
    });
    useUserMock.mockReturnValue({ user: null });

    renderWithProviders(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "ユーザーメニューを開く" }));

    const link = screen.getByRole("menuitem", { name: "更新履歴" });
    expect(link).toHaveAttribute("href", "/updates");
  });
});

it("ログアウトで認証を破棄する前に保護画面を外す", async () => {
  const user = userEvent.setup();
  setSignOutState({ pending: false, error: "" });
  const signOut = vi.fn(async () => {
    expect(screen.queryByTestId("protected-query")).not.toBeInTheDocument();
  });
  useClerkMock.mockReturnValue({ openUserProfile: vi.fn(), signOut });
  useUserMock.mockReturnValue({ user: null });
  function AppGate() {
    const { pending } = useSignOutState();
    return pending ? (
      <div>ログアウト中</div>
    ) : (
      <>
        <div data-testid="protected-query" />
        <UserMenu />
      </>
    );
  }
  renderWithProviders(
    <MemoryRouter>
      <AppGate />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "ユーザーメニューを開く" }));
  await user.click(screen.getByRole("menuitem", { name: "ログアウト" }));
  expect(signOut).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ログアウト失敗時は保護画面を復元し再試行できる", async () => {
  const user = userEvent.setup();
  setSignOutState({ pending: false, error: "" });
  const signOut = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  useClerkMock.mockReturnValue({ openUserProfile: vi.fn(), signOut });
  useUserMock.mockReturnValue({ user: null });
  function AppGate() {
    const { pending } = useSignOutState();
    return pending ? <div>ログアウト中</div> : <UserMenu />;
  }
  renderWithProviders(
    <MemoryRouter>
      <AppGate />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "ユーザーメニューを開く" }));
  await user.click(screen.getByRole("menuitem", { name: "ログアウト" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ユーザーメニューを開く" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "ユーザーメニューを開く" }));
  await user.click(screen.getByRole("menuitem", { name: "ログアウト" }));
  expect(signOut).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
