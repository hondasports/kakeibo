import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { apiMockWith } from "../../../test/apiMock";
import { AccountDeletionPage } from "./AccountDeletionPage";

const {
  useActionMock,
  useMutationMock,
  useNavigateMock,
  useQueryMock,
  useReverificationMock,
  useUserMock,
  useAuthMock,
  isReverificationCancelledErrorMock,
} = vi.hoisted(() => ({
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
  useNavigateMock: vi.fn(),
  useQueryMock: vi.fn(),
  useReverificationMock: vi.fn(),
  useUserMock: vi.fn(),
  useAuthMock: vi.fn(),
  isReverificationCancelledErrorMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("@clerk/react", () => ({
  useAuth: useAuthMock,
  useReverification: useReverificationMock,
  useUser: useUserMock,
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: isReverificationCancelledErrorMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: useNavigateMock };
});

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "accountDeletion.getAccountDeletionPreview": "account-deletion-preview",
    "accountDeletionActions.requestAccountDeletion": "request-account-deletion",
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

const strictReverificationHint = {
  clerk_error: {
    type: "forbidden",
    reason: "reverification-error",
    metadata: { reverification: "strict" },
  },
};
const reauthenticationFailedCode = "ACCOUNT_DELETION_REAUTHENTICATION_FAILED";
const reauthenticationFailedMessage =
  "本人確認を完了できなかったため、アカウント削除は開始されていません。続けるには、もう一度「アカウントを削除する」を押して本人確認を完了してください。";

type DeletionFetcher = (args: { confirmationText: string }) => Promise<unknown>;

describe("AccountDeletionPage", () => {
  const requestDeletion = vi.fn();
  const setActiveGroup = vi.fn();
  const navigate = vi.fn();
  const getToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requestDeletion.mockResolvedValue("request-id");
    setActiveGroup.mockResolvedValue(undefined);
    getToken.mockResolvedValue("session-token-1");
    useActionMock.mockImplementation((reference: unknown) =>
      reference === "request-account-deletion" ? requestDeletion : vi.fn(),
    );
    useMutationMock.mockReturnValue(setActiveGroup);
    useAuthMock.mockReturnValue({ getToken });
    useReverificationMock.mockImplementation((fetcher: DeletionFetcher) => fetcher);
    isReverificationCancelledErrorMock.mockReturnValue(false);
    useNavigateMock.mockReturnValue(navigate);
    useUserMock.mockReturnValue({ user: null });
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

  it("GROUP_MEMBERSHIP_INVARIANT のときサポート案内を表示し、設定へ戻れる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(
      previewWith({ canDelete: false, errorCode: "GROUP_MEMBERSHIP_INVARIANT" }),
    );

    renderWithProviders(<AccountDeletionPage />);

    expect(screen.getByRole("heading", { name: "アカウントを削除できません" })).toBeInTheDocument();
    expect(
      screen.getByText(/サポート（hondasports@gmail.com）へお問い合わせください/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "アカウントを削除する" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "設定に戻る" }));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("離脱・削除対象グループの一覧を表示し、確認文言「削除」の入力後にfresh token付きで退会を開始できる", async () => {
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
    expect(
      screen.getByText(
        /本人確認の画面は英語で表示され、登録メールアドレスに届くコードの入力を求められる場合があります/,
      ),
    ).toBeInTheDocument();
    expect(useReverificationMock).toHaveBeenCalled();

    const deleteButton = screen.getByRole("button", { name: "アカウントを削除する" });
    expect(deleteButton).toBeDisabled();

    const input = screen.getByRole("textbox", { name: "確認用入力" });
    await user.type(input, "削");
    expect(deleteButton).toBeDisabled();
    await user.type(input, "除");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    await vi.waitFor(() => {
      expect(getToken).toHaveBeenCalledWith({ skipCache: true });
      expect(requestDeletion).toHaveBeenCalledWith({
        confirmationText: "削除",
        sessionToken: "session-token-1",
      });
      expect(navigate).toHaveBeenCalledWith("/settings/account/delete/status", { replace: true });
    });
  });

  it("再認証後の自動再送でもキャッシュ済みtokenを使い回さず新しいtokenを取り直す", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    getToken.mockResolvedValueOnce("session-token-1").mockResolvedValueOnce("session-token-2");
    requestDeletion
      .mockResolvedValueOnce(strictReverificationHint)
      .mockResolvedValueOnce("request-id");
    useReverificationMock.mockImplementation((fetcher: DeletionFetcher) => {
      return async (args: { confirmationText: string }) => {
        const first = await fetcher(args);
        if (first === strictReverificationHint) return await fetcher(args);
        return first;
      };
    });

    renderWithProviders(<AccountDeletionPage />);
    await user.type(screen.getByRole("textbox", { name: "確認用入力" }), "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    await vi.waitFor(() => {
      expect(getToken).toHaveBeenCalledTimes(2);
      expect(getToken).toHaveBeenNthCalledWith(1, { skipCache: true });
      expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
      expect(requestDeletion).toHaveBeenNthCalledWith(1, {
        confirmationText: "削除",
        sessionToken: "session-token-1",
      });
      expect(requestDeletion).toHaveBeenNthCalledWith(2, {
        confirmationText: "削除",
        sessionToken: "session-token-2",
      });
    });
  });

  it("再認証後もstrict要件を満たさないときは本人確認失敗の文言を表示して成功画面へ進まない", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    requestDeletion.mockResolvedValue(strictReverificationHint);

    renderWithProviders(<AccountDeletionPage />);
    await user.type(screen.getByRole("textbox", { name: "確認用入力" }), "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(await screen.findByText(reauthenticationFailedMessage)).toBeInTheDocument();
    expect(screen.queryByText(/アカウント削除を開始できませんでした/)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("本人確認を検証できない拒否では本人確認失敗の文言を表示し、その他の送信失敗と区別する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    requestDeletion.mockRejectedValueOnce(new ConvexError({ code: reauthenticationFailedCode }));

    renderWithProviders(<AccountDeletionPage />);
    const input = screen.getByRole("textbox", { name: "確認用入力" });
    await user.type(input, "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(await screen.findByText(reauthenticationFailedMessage)).toBeInTheDocument();
    expect(screen.queryByText(/アカウント削除を開始できませんでした/)).not.toBeInTheDocument();
    expect(input).toHaveValue("削除");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("再認証応答でもIDでもない結果は本人確認失敗ではなく送信失敗として表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    requestDeletion.mockResolvedValue({ unexpected: true });

    renderWithProviders(<AccountDeletionPage />);
    await user.type(screen.getByRole("textbox", { name: "確認用入力" }), "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(await screen.findByText(/アカウント削除を開始できませんでした/)).toBeInTheDocument();
    expect(screen.queryByText(reauthenticationFailedMessage)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("本人確認をキャンセルしたときは退会開始せず、理由と次の行動を表示して入力内容を保持する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    const cancelError = new Error("reverification cancelled");
    isReverificationCancelledErrorMock.mockImplementation(
      (error: unknown) => error === cancelError,
    );
    useReverificationMock.mockImplementation(() => async () => {
      throw cancelError;
    });

    renderWithProviders(<AccountDeletionPage />);
    const input = screen.getByRole("textbox", { name: "確認用入力" });
    await user.type(input, "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(
      await screen.findByText(/本人確認がキャンセルされたため、アカウント削除は開始されていません/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/もう一度「アカウントを削除する」を押して本人確認を完了してください/),
    ).toBeInTheDocument();
    expect(input).toHaveValue("削除");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "アカウントを削除する" })).toBeEnabled();
  });

  it("退会開始が失敗したらキャンセルと別のエラーを表示して再試行でき、入力内容を保持する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    requestDeletion.mockRejectedValueOnce(new Error("server error"));

    renderWithProviders(<AccountDeletionPage />);

    const input = screen.getByRole("textbox", { name: "確認用入力" });
    await user.type(input, "削除");
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));

    expect(await screen.findByText(/アカウント削除を開始できませんでした/)).toBeInTheDocument();
    expect(screen.queryByText(/本人確認がキャンセルされたため/)).not.toBeInTheDocument();
    expect(input).toHaveValue("削除");
    expect(screen.getByRole("button", { name: "アカウントを削除する" })).toBeEnabled();
  });

  it("メールアドレスが分かるときは「削除」とメールアドレスの両方の入力後にだけ退会を開始できる", async () => {
    const user = userEvent.setup();
    useUserMock.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: "me@example.com" } },
    });
    useQueryMock.mockReturnValue(previewWith({}));

    renderWithProviders(<AccountDeletionPage />);

    const emailInput = screen.getByRole("textbox", { name: "メールアドレス入力" });
    // 誤操作防止の確認入力であり、正解のメールアドレスは画面に出さない
    expect(screen.queryByText(/me@example.com/)).not.toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: "アカウントを削除する" });

    await user.type(screen.getByRole("textbox", { name: "確認用入力" }), "削除");
    expect(deleteButton).toBeDisabled();

    await user.type(emailInput, "other@example.com");
    expect(deleteButton).toBeDisabled();

    await user.clear(emailInput);
    await user.type(emailInput, "Me@Example.com ");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    await vi.waitFor(() => {
      expect(requestDeletion).toHaveBeenCalledWith({
        confirmationText: "削除",
        sessionToken: "session-token-1",
      });
      expect(navigate).toHaveBeenCalledWith("/settings/account/delete/status", { replace: true });
    });
  });

  it("確認画面から設定へ戻れる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(previewWith({}));
    renderWithProviders(<AccountDeletionPage />);

    await user.click(screen.getByRole("button", { name: "設定に戻る" }));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });
});
