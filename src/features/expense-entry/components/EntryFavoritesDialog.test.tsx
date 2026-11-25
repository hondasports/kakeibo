import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { EntryFavoritesDialog } from "./EntryFavoritesDialog";

const useQueryMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (endpoint: unknown) => (endpoint === "delete-favorite" ? deleteMock : vi.fn()),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "entryFavorites.queries.listEntryFavorites": "list-favorites",
    "entryFavorites.mutations.deleteEntryFavorite": "delete-favorite",
  }),
}));

const favorite = {
  id: "fav1",
  title: "スーパー",
  categoryId: "cat-food",
  amountYen: 1234,
  memo: "週末まとめ買い",
};

const categoryNames = new Map([["cat-food", "食費"]]);

let favorites: unknown;
const onApplyMock = vi.fn();
const onCloseMock = vi.fn();

function renderDialog() {
  useQueryMock.mockImplementation((endpoint: unknown) =>
    endpoint === "list-favorites" ? favorites : undefined,
  );
  return renderWithProviders(
    <EntryFavoritesDialog
      categoryNames={categoryNames}
      onApply={onApplyMock}
      onClose={onCloseMock}
      open
    />,
  );
}

describe("EntryFavoritesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMock.mockResolvedValue(null);
    favorites = [favorite];
  });

  it("読込中は読み込み表示にする", () => {
    favorites = undefined;
    renderDialog();
    expect(screen.getByText("読み込んでいます…")).toBeInTheDocument();
  });

  it("空なら空の案内を表示する", () => {
    favorites = [];
    renderDialog();
    expect(
      screen.getByText("お気に入りはまだありません。「お気に入りに保存」で登録できます。"),
    ).toBeInTheDocument();
  });

  it("一覧にタイトル・金額・カテゴリ名を表示する", () => {
    renderDialog();
    const item = screen.getByText("食費").closest("li");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText("スーパー 1,234円")).toBeInTheDocument();
    expect(within(item as HTMLElement).getByText("食費")).toBeInTheDocument();
  });

  it("「選ぶ」でtitle・categoryId・amountYen・memoをonApplyへ渡す", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "選ぶ" }));

    expect(onApplyMock).toHaveBeenCalledWith({
      title: "スーパー",
      categoryId: "cat-food",
      amountYen: 1234,
      memo: "週末まとめ買い",
    });
  });

  it("削除ボタンでentryFavoriteIdをmutationへ渡す", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "スーパーをお気に入りから削除" }));

    expect(deleteMock).toHaveBeenCalledWith({ entryFavoriteId: "fav1" });
  });

  it("削除に失敗したらエラーを表示する", async () => {
    deleteMock.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "スーパーをお気に入りから削除" }));

    expect(await screen.findByText("お気に入りの削除に失敗しました")).toBeInTheDocument();
  });

  it("カテゴリ名が不明なら「不明なカテゴリ」と表示する", () => {
    favorites = [{ ...favorite, categoryId: "cat-unknown" }];
    renderDialog();
    expect(screen.getByText("不明なカテゴリ")).toBeInTheDocument();
  });
});
