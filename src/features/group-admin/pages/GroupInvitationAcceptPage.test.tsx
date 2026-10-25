import { getFunctionName } from "convex/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { GroupInvitationAcceptPage } from "./GroupInvitationAcceptPage";

const {
  previewInvitationMock,
  acceptGroupInvitationMock,
  signInSsoMock,
  signUpFinalizeMock,
  signUpSsoMock,
  signUpTicketMock,
  signUpUpdateMock,
  useAuthMock,
  useClerkMock,
  useConvexAuthMock,
  useNavigateMock,
  useSearchParamsMock,
  useSignInMock,
  useSignUpMock,
} = vi.hoisted(() => ({
  previewInvitationMock: vi.fn(),
  acceptGroupInvitationMock: vi.fn(),
  signInSsoMock: vi.fn(),
  signUpFinalizeMock: vi.fn(),
  signUpSsoMock: vi.fn(),
  signUpTicketMock: vi.fn(),
  signUpUpdateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useClerkMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
  useNavigateMock: vi.fn(),
  useSearchParamsMock: vi.fn(),
  useSignInMock: vi.fn(),
  useSignUpMock: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useAuth: useAuthMock,
  useClerk: useClerkMock,
  useSignIn: useSignInMock,
  useSignUp: useSignUpMock,
}));

vi.mock("convex/react", () => ({
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":previewInvitation")
      ? previewInvitationMock
      : acceptGroupInvitationMock,
  useConvexAuth: useConvexAuthMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: useNavigateMock,
    useSearchParams: useSearchParamsMock,
  };
});

function renderPage(initialEntry = "/group/invitations/accept?token=invite-token") {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/group/invitations/accept" element={<GroupInvitationAcceptPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GroupInvitationAcceptPage", () => {
  beforeEach(() => {
    previewInvitationMock.mockReset();
    previewInvitationMock.mockResolvedValue({
      groupId: "group-001",
      groupName: "招待先の家計",
      activeGroupId: null,
      activeGroupName: null,
      isExistingMember: false,
    });
    acceptGroupInvitationMock.mockReset();
    signInSsoMock.mockReset();
    signUpFinalizeMock.mockReset();
    signUpSsoMock.mockReset();
    signUpTicketMock.mockReset();
    signUpUpdateMock.mockReset();
    useAuthMock.mockReset();
    useClerkMock.mockReset();
    useConvexAuthMock.mockReset();
    useNavigateMock.mockReset();
    useSearchParamsMock.mockReset();
    useSignInMock.mockReset();
    useSignUpMock.mockReset();
    acceptGroupInvitationMock.mockResolvedValue("group-001");
    signInSsoMock.mockResolvedValue({ error: null });
    signUpFinalizeMock.mockResolvedValue({ error: null });
    signUpSsoMock.mockResolvedValue({ error: null });
    signUpTicketMock.mockResolvedValue({ error: null });
    signUpUpdateMock.mockResolvedValue({ error: null });
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    useClerkMock.mockReturnValue({ signOut: vi.fn().mockResolvedValue(undefined) });
    useConvexAuthMock.mockReturnValue({ isAuthenticated: false });
    useNavigateMock.mockReturnValue(vi.fn());
    useSearchParamsMock.mockImplementation(() => [
      new URLSearchParams("token=invite-token&__clerk_ticket=ticket-001"),
    ]);
    useSignInMock.mockReturnValue({
      signIn: {
        sso: signInSsoMock,
      },
    });
    useSignUpMock.mockReturnValue({
      signUp: {
        finalize: signUpFinalizeMock,
        missingFields: [],
        sso: signUpSsoMock,
        status: "complete",
        ticket: signUpTicketMock,
        update: signUpUpdateMock,
      },
    });
  });

  it("token がなければエラーを表示する", () => {
    useSearchParamsMock.mockImplementation(() => [new URLSearchParams("")]);

    renderPage("/group/invitations/accept");

    expect(screen.getByText("招待トークンが見つかりませんでした。")).toBeInTheDocument();
  });

  function authenticateToken() {
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    useSearchParamsMock.mockImplementation(() => [new URLSearchParams("token=invite-token")]);
  }

  it("URLを開いても受諾せず、招待先を確認してクリックした場合だけ参加する", async () => {
    const navigateMock = vi.fn();
    useNavigateMock.mockReturnValue(navigateMock);
    authenticateToken();
    renderPage();

    await screen.findByText("招待先の家計");
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "招待を受け入れて参加する" }));
    await waitFor(() => {
      expect(acceptGroupInvitationMock).toHaveBeenCalledWith({
        token: "invite-token",
        switchActiveGroup: false,
      });
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("別のactive groupからの切替には個別の同意を要求する", async () => {
    authenticateToken();
    previewInvitationMock.mockResolvedValue({
      groupId: "group-001",
      groupName: "招待先の家計",
      activeGroupId: "group-current",
      activeGroupName: "現在の家計",
      isExistingMember: false,
    });
    renderPage();
    await screen.findByText("招待先の家計");
    expect(screen.getByText(/現在の家計/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "招待を受け入れて参加する" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "表示するグループの切り替えに同意する" }));
    fireEvent.click(button);
    await waitFor(() =>
      expect(acceptGroupInvitationMock).toHaveBeenCalledWith({
        token: "invite-token",
        switchActiveGroup: true,
        expectedActiveGroupId: "group-current",
      }),
    );
  });

  it("受諾中の二重送信を防ぐ", async () => {
    authenticateToken();
    let finish: (groupId: string) => void = () => {};
    acceptGroupInvitationMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage();
    const button = await screen.findByRole("button", { name: "招待を受け入れて参加する" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(acceptGroupInvitationMock).toHaveBeenCalledTimes(1);
    await act(async () => finish("group-001"));
  });

  it("受諾失敗後は確認を読み直し、切替への同意を取り直して再試行できる", async () => {
    authenticateToken();
    previewInvitationMock.mockResolvedValue({
      groupId: "group-001",
      groupName: "招待先の家計",
      activeGroupId: "group-current",
      activeGroupName: "現在の家計",
      isExistingMember: false,
    });
    acceptGroupInvitationMock.mockRejectedValueOnce(new Error("active group changed"));
    renderPage();
    const consent = await screen.findByRole("checkbox", {
      name: "表示するグループの切り替えに同意する",
    });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "招待を受け入れて参加する" }));
    expect(await screen.findByText(/招待内容を再確認して/)).toBeInTheDocument();
    await waitFor(() => expect(previewInvitationMock).toHaveBeenCalledTimes(2));
    const retryConsent = await screen.findByRole("checkbox", {
      name: "表示するグループの切り替えに同意する",
    });
    expect(retryConsent).not.toBeChecked();
    expect(screen.getByRole("button", { name: "招待を受け入れて参加する" })).toBeDisabled();
    fireEvent.click(retryConsent);
    fireEvent.click(screen.getByRole("button", { name: "招待を受け入れて参加する" }));
    await waitFor(() => expect(acceptGroupInvitationMock).toHaveBeenCalledTimes(2));
  });

  it("無効な招待やメール不一致では確認エラーを表示し、受諾操作を提供しない", async () => {
    authenticateToken();
    previewInvitationMock.mockRejectedValue(new Error("invitation not available"));
    renderPage();
    expect(await screen.findByText(/招待内容を確認できませんでした/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "招待を受け入れて参加する" }),
    ).not.toBeInTheDocument();
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
  });

  it("Clerk認証からtoken URLへ戻った後も、確認のクリックまでは受諾しない", async () => {
    const page = renderPage();
    await waitFor(() => expect(signUpFinalizeMock).toHaveBeenCalled());
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
    page.unmount();
    authenticateToken();
    renderPage();
    await screen.findByText("招待先の家計");
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "招待を受け入れて参加する" }));
    await waitFor(() => expect(acceptGroupInvitationMock).toHaveBeenCalledTimes(1));
  });

  it("未ログインかつ Clerk ticket があれば招待を消費して同じ受け入れURLへ戻す", async () => {
    const locationSpy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: "",
    } as Location);
    signUpFinalizeMock.mockImplementation(async ({ navigate }) => {
      navigate({ decorateUrl: (url: string) => url });
      return { error: null };
    });

    renderPage();

    expect(document.querySelector("#clerk-captcha")).toBeInTheDocument();

    await waitFor(() => {
      expect(signUpTicketMock).toHaveBeenCalledWith({ ticket: "ticket-001" });
      expect(signUpFinalizeMock).toHaveBeenCalled();
      expect(window.location.href).toBe("/group/invitations/accept?token=invite-token");
    });

    locationSpy.mockRestore();
  });

  it("Clerk ticket 処理後に追加情報が必要なら名前入力を表示する", async () => {
    useSignUpMock.mockReturnValue({
      signUp: {
        finalize: signUpFinalizeMock,
        missingFields: ["first_name", "last_name"],
        sso: signUpSsoMock,
        status: "missing_requirements",
        ticket: signUpTicketMock,
        update: signUpUpdateMock,
      },
    });
    signUpTicketMock.mockResolvedValue({
      error: null,
      missingFields: ["first_name", "last_name"],
    });

    renderPage();

    await waitFor(() => {
      expect(signUpTicketMock).toHaveBeenCalledWith({ ticket: "ticket-001" });
      expect(signUpFinalizeMock).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "招待を完了する" })).toBeInTheDocument();
    });
  });

  it("名前入力後に必要な項目だけ更新して finalize する", async () => {
    const signUpResource = {
      finalize: signUpFinalizeMock,
      missingFields: ["first_name", "last_name"],
      sso: signUpSsoMock,
      status: "missing_requirements",
      ticket: signUpTicketMock,
      update: signUpUpdateMock,
    };
    signUpTicketMock.mockResolvedValue({
      error: null,
      missingFields: ["first_name", "last_name"],
    });
    signUpUpdateMock.mockImplementation(async () => {
      signUpResource.status = "complete";
      return { error: null };
    });
    useSignUpMock.mockReturnValue({ signUp: signUpResource });

    renderPage();

    await screen.findByRole("heading", { name: "招待を完了する" });
    fireEvent.change(screen.getByRole("textbox", { name: /名/ }), {
      target: { value: "Taro" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /姓/ }), {
      target: { value: "Yamada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "招待を完了する" }));

    await waitFor(() => {
      expect(signUpUpdateMock).toHaveBeenCalledWith({
        firstName: "Taro",
        lastName: "Yamada",
      });
      expect(signUpFinalizeMock).toHaveBeenCalled();
    });
  });

  it("password が不足していればGoogleサインアップへ進める", async () => {
    useSignUpMock.mockReturnValue({
      signUp: {
        finalize: signUpFinalizeMock,
        missingFields: ["password"],
        sso: signUpSsoMock,
        status: "missing_requirements",
        ticket: signUpTicketMock,
        update: signUpUpdateMock,
      },
    });
    signUpTicketMock.mockResolvedValue({
      error: null,
      missingFields: ["password"],
    });

    renderPage();

    await waitFor(() => {
      expect(signUpSsoMock).toHaveBeenCalledWith({
        redirectCallbackUrl: "/sso-callback",
        redirectUrl: "/group/invitations/accept?token=invite-token",
        strategy: "oauth_google",
      });
      expect(screen.queryByRole("heading", { name: "招待を完了する" })).not.toBeInTheDocument();
    });
  });

  it("既存アカウント向けClerk ticketならGoogleサインインへ進める", async () => {
    useSearchParamsMock.mockImplementation(() => [
      new URLSearchParams("token=invite-token&__clerk_ticket=ticket-001&__clerk_status=sign_in"),
    ]);

    renderPage(
      "/group/invitations/accept?token=invite-token&__clerk_ticket=ticket-001&__clerk_status=sign_in",
    );

    await waitFor(() => {
      expect(signInSsoMock).toHaveBeenCalledWith({
        redirectCallbackUrl: "/sso-callback",
        redirectUrl: "/group/invitations/accept?token=invite-token",
        strategy: "oauth_google",
      });
      expect(signUpTicketMock).not.toHaveBeenCalled();
      expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
    });
  });

  it("新規登録ticketが既存アカウントエラーならGoogleサインインへフォールバックする", async () => {
    signUpTicketMock.mockRejectedValue(
      new Error("An account already exists for this invitation. Sign in instead."),
    );

    renderPage();

    await waitFor(() => {
      expect(signUpTicketMock).toHaveBeenCalledWith({ ticket: "ticket-001" });
      expect(signInSsoMock).toHaveBeenCalledWith({
        redirectCallbackUrl: "/sso-callback",
        redirectUrl: "/group/invitations/accept?token=invite-token",
        strategy: "oauth_google",
      });
      expect(screen.queryByText(/招待リンクの認証を完了できませんでした/)).not.toBeInTheDocument();
    });
  });

  it("Clerk ticket 処理後の不足項目が未対応なら名前フォームを出さない", async () => {
    useSignUpMock.mockReturnValue({
      signUp: {
        finalize: signUpFinalizeMock,
        missingFields: ["username"],
        sso: signUpSsoMock,
        status: "missing_requirements",
        ticket: signUpTicketMock,
        update: signUpUpdateMock,
      },
    });
    signUpTicketMock.mockResolvedValue({
      error: null,
      missingFields: ["username"],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Clerkのサインアップ必須項目/)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "招待を完了する" })).not.toBeInTheDocument();
    });
  });

  it("Clerk ticket 付きURLでは操作するまで既存セッションを維持する", async () => {
    const signOutMock = vi.fn().mockResolvedValue(undefined);
    const invitationPath =
      "/group/invitations/accept?token=invite-token&__clerk_ticket=ticket-001&__clerk_status=sign_up";
    window.history.pushState({}, "", invitationPath);
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    useClerkMock.mockReturnValue({ signOut: signOutMock });
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true });

    renderPage(
      "/group/invitations/accept?token=invite-token&__clerk_ticket=ticket-001&__clerk_status=sign_up",
    );

    expect(
      screen.getByText(
        "招待先のアカウントで続けるには、現在のアカウントからサインアウトしてください。",
      ),
    ).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(signUpTicketMock).not.toHaveBeenCalled();
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "アカウントを切り替える" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({
        redirectUrl: invitationPath,
      });
    });
    expect(signUpTicketMock).not.toHaveBeenCalled();
    expect(acceptGroupInvitationMock).not.toHaveBeenCalled();
  });

  it("アカウント切り替えの処理中はボタンを無効にする", async () => {
    let finishSignOut: () => void = () => {};
    const signOutMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSignOut = resolve;
        }),
    );
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    useClerkMock.mockReturnValue({ signOut: signOutMock });
    renderPage();

    const button = screen.getByRole("button", { name: "アカウントを切り替える" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "招待を処理中" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishSignOut();
    });
  });

  it("アカウント切り替えに失敗したら説明を表示し、再操作で続行できる", async () => {
    const failure = new Error("sign out failed");
    const signOutMock = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    useClerkMock.mockReturnValue({ signOut: signOutMock });
    renderPage();

    try {
      fireEvent.click(screen.getByRole("button", { name: "アカウントを切り替える" }));
      expect(await screen.findByText(/招待リンクの認証を開始できませんでした/)).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith(
        "[GroupInvitationAcceptPage] failed to sign out current session:",
        failure,
      );
      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(signUpTicketMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "アカウントを切り替える" }));
      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(2));
      expect(screen.queryByText(/招待リンクの認証を開始できませんでした/)).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
