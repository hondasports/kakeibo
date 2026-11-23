import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiMockWith } from "../../../test/apiMock";
import { EMPTY_EXPENSE_SEARCH_FORM } from "../lib/searchParams";
import { SavedExpenseSearches } from "./SavedExpenseSearches";

const useQueryMock = vi.fn();
const saveMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (endpoint: unknown) =>
    endpoint === "save-mutation" ? saveMock : endpoint === "delete-mutation" ? deleteMock : vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "savedExpenseSearches.queries.listSavedExpenseSearches": "list-saved",
    "savedExpenseSearches.mutations.saveExpenseSearch": "save-mutation",
    "savedExpenseSearches.mutations.deleteSavedExpenseSearch": "delete-mutation",
    "categories.queries.listForSettings": "categories-for-settings",
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

let list: unknown;

function renderComponent(applied = EMPTY_EXPENSE_SEARCH_FORM, isValid = true) {
  return render(
    <MemoryRouter initialEntries={["/search"]}>
      <SavedExpenseSearches applied={applied} isValid={isValid} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saveMock.mockResolvedValue("new-id");
  deleteMock.mockResolvedValue(null);
  list = {
    saved: [
      {
        id: "s1",
        name: "先月の食費",
        query: "type=expense&categoryId=cat-food&from=2026-10-01&to=2026-10-31",
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    recent: [
      { id: "r1", query: "q=%E5%8C%97%E6%B5%9C&sort=amountDesc", createdAt: 3, updatedAt: 3 },
    ],
  };
  useQueryMock.mockImplementation((endpoint: unknown, args: unknown) => {
    if (endpoint === "list-saved") return list;
    if (endpoint === "categories-for-settings") {
      return args === "skip"
        ? undefined
        : [
            { _id: "cat-food", name: "食費", isActive: true },
            { _id: "cat-old", name: "旧カテゴリ", isActive: false },
          ];
    }
    return undefined;
  });
});

describe("SavedExpenseSearches", () => {
  it("適用中の条件が無いと「この条件を保存」は無効", () => {
    renderComponent(EMPTY_EXPENSE_SEARCH_FORM);
    expect(screen.getByRole("button", { name: "この条件を保存" })).toBeDisabled();
  });

  it("条件が不正なときも保存は無効", () => {
    renderComponent({ ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "北浜" }, false);
    expect(screen.getByRole("button", { name: "この条件を保存" })).toBeDisabled();
  });

  it("名前を付けて保存すると、適用中条件の正規化したqueryと名前でmutationを呼ぶ", async () => {
    const user = userEvent.setup();
    renderComponent({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      entryType: "expense",
      shopQuery: " 北浜 ",
      sortOrder: "amountDesc",
    });
    await user.click(screen.getByRole("button", { name: "この条件を保存" }));
    const dialog = screen.getByRole("dialog", { name: "検索条件を保存" });
    await user.type(within(dialog).getByLabelText("名前"), "北浜の支出");
    await user.click(within(dialog).getByRole("button", { name: "保存する" }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith({
        name: "北浜の支出",
        query: "type=expense&sort=amountDesc&q=%E5%8C%97%E6%B5%9C",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("名前が空だと保存できず、31文字以上は入力エラーを示す", async () => {
    const user = userEvent.setup();
    renderComponent({ ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "北浜" });
    await user.click(screen.getByRole("button", { name: "この条件を保存" }));
    const dialog = screen.getByRole("dialog", { name: "検索条件を保存" });
    expect(within(dialog).getByRole("button", { name: "保存する" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("名前"), "あ".repeat(31));
    expect(within(dialog).getByRole("button", { name: "保存する" })).toBeDisabled();
    expect(within(dialog).getByText("名前は30文字以内で入力してください")).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("保存に失敗したらサーバー文言を表示し、ダイアログと入力を残す", async () => {
    const user = userEvent.setup();
    saveMock.mockRejectedValue(
      new Error("保存できる検索条件は20件までです。不要な条件を削除してください。"),
    );
    renderComponent({ ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "北浜" });
    await user.click(screen.getByRole("button", { name: "この条件を保存" }));
    const dialog = screen.getByRole("dialog", { name: "検索条件を保存" });
    await user.type(within(dialog).getByLabelText("名前"), "北浜");
    await user.click(within(dialog).getByRole("button", { name: "保存する" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "保存できる検索条件は20件までです。不要な条件を削除してください。",
    );
    expect(within(dialog).getByLabelText("名前")).toHaveValue("北浜");
  });

  it("保存した検索は名前で表示し、要約を添え、タップで保存したqueryへ遷移する", async () => {
    const user = userEvent.setup();
    renderComponent();
    const savedList = screen.getByRole("list", { name: "保存した検索" });
    const item = within(savedList).getByRole("button", { name: /^先月の食費(?!を)/ });
    expect(item).toHaveTextContent("支出、カテゴリ: 食費、2026-10-01〜2026-10-31");
    expect(savedList).not.toHaveTextContent("categoryId=");
    await user.click(item);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/search?type=expense&categoryId=cat-food&from=2026-10-01&to=2026-10-31",
    );
  });

  it("最近の検索は条件の要約で表示し、タップで再検索する（生のqueryは出さない）", async () => {
    const user = userEvent.setup();
    renderComponent();
    const recentList = screen.getByRole("list", { name: "最近の検索" });
    expect(recentList).toHaveTextContent("キーワード: 北浜、金額が大きい順");
    expect(recentList).not.toHaveTextContent("sort=");
    await user.click(within(recentList).getByRole("button", { name: /キーワード: 北浜/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/search?q=%E5%8C%97%E6%B5%9C&sort=amountDesc",
    );
  });

  it("削除ボタンは名前を含むaria-labelを持ち、押すと削除mutationを呼ぶ", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByRole("button", { name: "先月の食費を保存した検索から削除" }));
    expect(deleteMock).toHaveBeenCalledWith({ savedExpenseSearchId: "s1" });
  });

  it("削除に失敗したらエラーを表示する", async () => {
    const user = userEvent.setup();
    deleteMock.mockRejectedValue(new Error("保存した検索が見つかりません"));
    renderComponent();
    await user.click(screen.getByRole("button", { name: "先月の食費を保存した検索から削除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存した検索が見つかりません");
  });

  it("一覧にカテゴリ条件が無くても、適用中のカテゴリ名を保存ダイアログの要約に出す", async () => {
    const user = userEvent.setup();
    list = { saved: [], recent: [] };
    renderComponent({ ...EMPTY_EXPENSE_SEARCH_FORM, entryType: "expense", categoryId: "cat-food" });
    await user.click(screen.getByRole("button", { name: "この条件を保存" }));
    const dialog = screen.getByRole("dialog", { name: "検索条件を保存" });
    expect(within(dialog).getByText("支出、カテゴリ: 食費")).toBeInTheDocument();
  });

  it("保存も最近の検索も無いときは一覧を出さない", () => {
    list = { saved: [], recent: [] };
    renderComponent();
    expect(screen.queryByRole("list", { name: "保存した検索" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "最近の検索" })).not.toBeInTheDocument();
  });

  it("一覧が想定外の形・読み込み中でも落ちない", () => {
    list = undefined;
    renderComponent();
    expect(screen.queryByRole("list", { name: "保存した検索" })).not.toBeInTheDocument();
    list = [{ _id: "cat-food" }];
    renderComponent();
    expect(screen.queryByRole("list", { name: "最近の検索" })).not.toBeInTheDocument();
  });
});
