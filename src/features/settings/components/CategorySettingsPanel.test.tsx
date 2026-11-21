import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { renderWithProviders } from "../../../test/render";
import { CategorySettingsPanel } from "./CategorySettingsPanel";

type Category = {
  _id: Id<"categories">;
  groupId: Id<"groups">;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
};

const {
  createCategoryMock,
  deactivateCategoryMock,
  moveCategoryMock,
  reactivateCategoryMock,
  updateCategoryMock,
  useMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  createCategoryMock: vi.fn(),
  deactivateCategoryMock: vi.fn(),
  moveCategoryMock: vi.fn(),
  reactivateCategoryMock: vi.fn(),
  updateCategoryMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    categories: {
      queries: {
        listForSettings: "categories.queries.listForSettings",
      },
      mutations: {
        createCategory: "categories.mutations.createCategory",
        deactivateCategory: "categories.mutations.deactivateCategory",
        moveCategory: "categories.mutations.moveCategory",
        reactivateCategory: "categories.mutations.reactivateCategory",
        updateCategory: "categories.mutations.updateCategory",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

const categories: Category[] = [
  {
    _id: "cat-food" as Id<"categories">,
    groupId: "group-1" as Id<"groups">,
    name: "食費",
    color: "#AAB7C4",
    isActive: true,
    sortOrder: 10,
  },
  {
    _id: "cat-old" as Id<"categories">,
    groupId: "group-1" as Id<"groups">,
    name: "旧カテゴリ",
    color: "#765F4F",
    isActive: false,
    sortOrder: 20,
  },
];

describe("CategorySettingsPanel", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deactivateCategoryMock.mockReset();
    reactivateCategoryMock.mockReset();
    moveCategoryMock.mockReset();
    createCategoryMock.mockResolvedValue(undefined);
    updateCategoryMock.mockResolvedValue(undefined);
    deactivateCategoryMock.mockResolvedValue(undefined);
    reactivateCategoryMock.mockResolvedValue(undefined);
    moveCategoryMock.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue(categories);
    useMutationMock.mockImplementation((reference: string) => {
      if (reference === "categories.mutations.createCategory") return createCategoryMock;
      if (reference === "categories.mutations.updateCategory") return updateCategoryMock;
      if (reference === "categories.mutations.deactivateCategory") return deactivateCategoryMock;
      if (reference === "categories.mutations.reactivateCategory") return reactivateCategoryMock;
      if (reference === "categories.mutations.moveCategory") return moveCategoryMock;
      throw new Error(`Unexpected mutation reference: ${reference}`);
    });
  });

  it("カテゴリ取得中は読み込み状態を表示する", () => {
    // Given: カテゴリ一覧のqueryがまだ完了していない
    useQueryMock.mockReturnValue(undefined);

    // When: カテゴリ設定を表示する
    renderWithProviders(<CategorySettingsPanel />);

    // Then: 読み込み中の状態が表示される
    expect(screen.getByLabelText("カテゴリを読み込んでいます")).toBeInTheDocument();
  });

  it("カテゴリを追加でき、入力欄を初期状態に戻す", async () => {
    // Given: 既存カテゴリが読み込まれている
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    // When: 新しいカテゴリ名を入力して追加する
    const createTrigger = screen.getByRole("button", { name: "カテゴリを追加" });
    expect(createTrigger).toHaveAttribute("aria-controls", "category-create-form");
    await user.click(createTrigger);
    await user.type(screen.getByLabelText("新しいカテゴリ名"), "交通");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    // Then: 作成mutationが呼ばれ、カテゴリ名の入力欄が空になる
    await waitFor(() => {
      expect(createCategoryMock).toHaveBeenCalledWith({
        name: "交通",
        color: "#8B5E3C",
        description: "",
      });
    });
    expect(screen.getByLabelText("新しいカテゴリ名")).toHaveValue("");
    expect(screen.getByText("カテゴリを追加しました")).toBeInTheDocument();
  });

  it("E2Eから安定して参照できる入力名を公開する", async () => {
    // Given: カテゴリ設定を表示する
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    // Then: Playwright がラベル描画に依存せず入力欄を参照できる
    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    expect(screen.getByRole("textbox", { name: "新しいカテゴリ名" })).toHaveAttribute(
      "name",
      "newCategoryName",
    );
    expect(screen.getByLabelText("新しいカテゴリ色")).toHaveAttribute("name", "newCategoryColor");

    const editTrigger = screen.getByRole("button", { name: "食費を編集" });
    expect(editTrigger).toHaveAttribute("aria-controls", "category-editor-cat-food");
    await user.click(editTrigger);
    expect(screen.getByRole("textbox", { name: "カテゴリ名を編集" })).toHaveAttribute(
      "name",
      "editCategoryName",
    );
    expect(screen.getByLabelText("カテゴリ色")).toHaveAttribute("name", "editCategoryColor");
  });

  it("カテゴリ名を編集して保存できる", async () => {
    // Given: 既存カテゴリが編集可能な状態で表示されている
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    // When: カテゴリ名を変更して保存する
    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    const editName = screen.getByLabelText("カテゴリ名を編集");
    await user.clear(editName);
    await user.type(editName, "スーパー");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    // Then: 更新mutationに編集後の値が渡る
    await waitFor(() => {
      expect(updateCategoryMock).toHaveBeenCalledWith({
        categoryId: "cat-food",
        name: "スーパー",
        color: "#AAB7C4",
        description: "",
      });
    });
    expect(screen.getByText("カテゴリを更新しました")).toBeInTheDocument();
  });

  it("カテゴリ作成時に複数行の分類ヒントを保存できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    await user.type(screen.getByLabelText("新しいカテゴリ名"), "ペット用品");
    await user.type(
      screen.getByLabelText("新しいカテゴリのAI分類ヒント"),
      "ペットフード\n衛生用品",
    );
    await user.click(screen.getByRole("button", { name: "追加する" }));

    await waitFor(() => {
      expect(createCategoryMock).toHaveBeenCalledWith({
        name: "ペット用品",
        color: "#8B5E3C",
        description: "ペットフード\n衛生用品",
      });
    });
  });

  it("分類ヒントは200文字まで入力できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    const description = screen.getByLabelText("新しいカテゴリのAI分類ヒント");
    fireEvent.change(description, { target: { value: "あ".repeat(200) } });

    expect(description).toHaveValue("あ".repeat(200));
    expect(screen.getByText("200/200")).toBeInTheDocument();
  });

  it("有効カテゴリの無効化は確認ダイアログ経由で実行する", async () => {
    // Given: 有効カテゴリと無効カテゴリが一覧にある
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    // When: 無効化ボタンを押す
    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    await user.click(screen.getByRole("button", { name: "食費を無効化" }));

    // Then: 影響を説明する確認ダイアログが出て、まだmutationは呼ばれない
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("カテゴリを無効化しますか");
    expect(dialog).toHaveTextContent("過去の家計記録や集計には影響しません");
    expect(deactivateCategoryMock).not.toHaveBeenCalled();

    // When: 確認する
    await user.click(screen.getByRole("button", { name: "無効化する" }));

    // Then: 対象IDで無効化mutationが呼ばれる
    await waitFor(() => {
      expect(deactivateCategoryMock).toHaveBeenCalledWith({ categoryId: "cat-food" });
    });
  });

  it("無効化の確認ダイアログをキャンセルするとmutationは呼ばれない", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    await user.click(screen.getByRole("button", { name: "食費を無効化" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "戻る" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(deactivateCategoryMock).not.toHaveBeenCalled();
  });

  it("無効カテゴリは有効化ボタンから再有効化できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "旧カテゴリを編集" }));
    await user.click(screen.getByRole("button", { name: "旧カテゴリを有効化" }));

    await waitFor(() => {
      expect(reactivateCategoryMock).toHaveBeenCalledWith({ categoryId: "cat-old" });
    });
  });

  it("カテゴリ名が空なら項目エラーを表示してmutationを呼ばない", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    await user.click(screen.getByRole("button", { name: "追加する" }));

    expect(await screen.findByText("カテゴリ名を入力してください")).toBeInTheDocument();
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("操作エラーのAlertから再試行できる", async () => {
    deactivateCategoryMock.mockRejectedValueOnce(new Error("network failed"));
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    await user.click(screen.getByRole("button", { name: "食費を無効化" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "無効化する" }));

    const retryButton = await screen.findByRole("button", { name: "再試行" });
    await user.click(retryButton);

    await waitFor(() => {
      expect(deactivateCategoryMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("カテゴリを無効化しました")).toBeInTheDocument();
  });

  it("失敗後に別グループへ切り替わると再試行ボタンは出ない", async () => {
    createCategoryMock.mockRejectedValueOnce(new Error("network failed"));
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    await user.type(screen.getByLabelText("新しいカテゴリ名"), "交通");
    await user.click(screen.getByRole("button", { name: "追加する" }));

    expect(await screen.findByRole("button", { name: "再試行" })).toBeInTheDocument();

    // 別グループのカテゴリ一覧に差し替わると再試行は無効になる
    useQueryMock.mockReturnValue([
      {
        ...categories[0],
        _id: "cat-other" as Id<"categories">,
        groupId: "group-2" as Id<"groups">,
      },
    ]);
    rerender(<CategorySettingsPanel />);

    expect(screen.queryByRole("button", { name: "再試行" })).not.toBeInTheDocument();
  });

  it("ブランドカラーのスウォッチからカテゴリ色を選べる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    const leafSwatch = screen.getByRole("button", { name: "葉色" });
    expect(leafSwatch).toHaveAttribute("aria-pressed", "false");

    await user.click(leafSwatch);

    expect(screen.getByLabelText("新しいカテゴリ色")).toHaveValue("#a6b28b");
    expect(leafSwatch).toHaveAttribute("aria-pressed", "true");
  });

  it("カテゴリの利用状態を色だけに依存せず表示する", () => {
    renderWithProviders(<CategorySettingsPanel />);

    expect(screen.getByText("使用中")).toBeInTheDocument();
    expect(screen.getByText("無効")).toBeInTheDocument();
  });

  it("カテゴリが0件なら追加導線のある空状態を表示する", () => {
    useQueryMock.mockReturnValue([]);

    renderWithProviders(<CategorySettingsPanel />);

    expect(screen.getByText("カテゴリがまだありません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最初のカテゴリを追加" })).toBeInTheDocument();
  });
});

describe("並び替えと未保存破棄", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deactivateCategoryMock.mockReset();
    reactivateCategoryMock.mockReset();
    moveCategoryMock.mockReset();
    createCategoryMock.mockResolvedValue(undefined);
    updateCategoryMock.mockResolvedValue(undefined);
    deactivateCategoryMock.mockResolvedValue(undefined);
    reactivateCategoryMock.mockResolvedValue(undefined);
    moveCategoryMock.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue(categories);
    useMutationMock.mockImplementation((reference: string) => {
      if (reference === "categories.mutations.createCategory") return createCategoryMock;
      if (reference === "categories.mutations.updateCategory") return updateCategoryMock;
      if (reference === "categories.mutations.deactivateCategory") return deactivateCategoryMock;
      if (reference === "categories.mutations.reactivateCategory") return reactivateCategoryMock;
      if (reference === "categories.mutations.moveCategory") return moveCategoryMock;
      throw new Error(`Unexpected mutation reference: ${reference}`);
    });
  });

  it("下移動ボタンで moveCategory mutation を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を下に移動" }));

    await waitFor(() => {
      expect(moveCategoryMock).toHaveBeenCalledWith({
        categoryId: "cat-food",
        direction: "down",
      });
    });
    expect(screen.getByText("並び順を更新しました")).toBeInTheDocument();
  });

  it("先頭は上移動・末尾は下移動が無効", () => {
    renderWithProviders(<CategorySettingsPanel />);

    expect(screen.getByRole("button", { name: "食費を上に移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "旧カテゴリを下に移動" })).toBeDisabled();
  });

  it("未変更なら別カテゴリへ確認なしで切り替えられる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    await user.click(screen.getByRole("button", { name: "旧カテゴリを編集" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const oldRow = screen.getByRole("listitem", { name: "カテゴリ 旧カテゴリ" });
    expect(within(oldRow).getByLabelText("カテゴリ名を編集")).toHaveValue("旧カテゴリ");
  });

  it("変更中に別カテゴリへ切り替えるときは破棄確認を出す", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    const editName = screen.getByLabelText("カテゴリ名を編集");
    await user.clear(editName);
    await user.type(editName, "食費変更");
    expect(screen.getByText(/未保存の変更があります/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "旧カテゴリを編集" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("変更を破棄しますか");
    expect(dialog).toHaveTextContent("「食費」の変更は保存されていません");

    await user.click(screen.getByRole("button", { name: "戻る" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const foodRow = screen.getByRole("listitem", { name: "カテゴリ 食費" });
    expect(within(foodRow).getByLabelText("カテゴリ名を編集")).toHaveValue("食費変更");

    await user.click(screen.getByRole("button", { name: "旧カテゴリを編集" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "破棄する" }));
    const switchedRow = await screen.findByRole("listitem", {
      name: "カテゴリ 旧カテゴリ",
    });
    expect(within(switchedRow).getByLabelText("カテゴリ名を編集")).toHaveValue("旧カテゴリ");
  });

  it("変更中にフォームを閉じるときも破棄確認を出し、確定で閉じる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CategorySettingsPanel />);

    await user.click(screen.getByRole("button", { name: "食費を編集" }));
    const editName = screen.getByLabelText("カテゴリ名を編集");
    await user.clear(editName);
    await user.type(editName, "食費変更");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("変更を破棄しますか");
    expect(screen.getByLabelText("カテゴリ名を編集")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "破棄する" }));
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "カテゴリ名を編集" })).not.toBeInTheDocument();
    });
  });
});
