import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseSearchResult } from "../../../../lib/convex/expenseSearch/searchExpenses";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithDatePickers } from "../../../test/render";
import { getCurrentWeekStartDate } from "../../week";
import { ExpenseSearchPage } from "./ExpenseSearchPage";

const useQueryMock = vi.fn();
const useQueriesMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useQueries: (queries: Record<string, { args: unknown }>) => useQueriesMock(queries),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "users.queries.getUserProfile": "get-user-profile",
    "categories.queries.listForSettings": "categories-list-for-settings",
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

const emptySearchResult: ExpenseSearchResult = {
  page: [],
  continueCursor: "v1.empty",
  isDone: true,
  truncated: false,
  comparisonTruncated: false,
  matchedGroupCount: 0,
  totalCount: 0,
  expenseCount: 0,
  incomeCount: 0,
  totalExpenseYen: 0,
  totalIncomeYen: 0,
  netAmountYen: 0,
  byCategory: [],
  trend: [],
  comparison: null,
};

describe("ExpenseSearchPage", () => {
  beforeEach(() => {
    useQueriesMock.mockImplementation((queries: Record<string, { args: unknown }>) => {
      const [key, query] = Object.entries(queries)[0] ?? [];
      return key === undefined || query === undefined
        ? {}
        : { [key]: useQueryMock("history-search", query.args) };
    });
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (_api === "categories-list-for-settings") {
        return [
          { _id: "cat-food", name: "食費", isActive: true },
          { _id: "cat-old", name: "旧カテゴリ", isActive: false },
        ];
      }
      if (args === undefined) {
        return [{ _id: "cat-food", name: "食費" }];
      }
      if (args === "skip") {
        return undefined;
      }
      return emptySearchResult;
    });
  });

  it("検索フォームと空の結果メッセージを表示する", () => {
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    const historyNavigation = screen.getByRole("navigation", { name: "履歴メニュー" });
    expect(historyNavigation).toBeInTheDocument();
    expect(within(historyNavigation).getByRole("link", { name: "履歴検索" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(historyNavigation).getByRole("link", { name: "週次サマリー" })).toHaveAttribute(
      "href",
      `/weeks/${getCurrentWeekStartDate(3)}`,
    );
    expect(screen.getByRole("heading", { name: "履歴検索", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("キーワード")).toBeInTheDocument();
    expect(screen.getByLabelText("カテゴリ")).toBeInTheDocument();
    expect(screen.getByLabelText("金額の下限")).toBeInTheDocument();
    expect(screen.getByLabelText("金額の上限")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "開始日" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "終了日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始日を選択" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "終了日を選択" })).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByText("条件に合う履歴はありません")).toBeInTheDocument();
  });

  it("不正な金額範囲ならエラーを出して検索しない", () => {
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?min=200&max=100"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "履歴メニュー" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("金額の下限は上限以下にしてください");
    expect(screen.queryByText("条件に合う履歴はありません")).not.toBeInTheDocument();
  });

  it("検索取得に失敗したら再試行を案内する", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      return new Error("search failed");
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("履歴検索に失敗しました。時間をおいてもう一度お試しください。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("追加読み込みに失敗しても表示済みの一覧を残す", async () => {
    const user = userEvent.setup();
    const firstPage = {
      ...emptySearchResult,
      page: [
        {
          _id: "expense-1",
          date: "2026-08-01",
          type: "expense" as const,
          shopName: "表示済みの店",
          amountYen: 1200,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry" as const,
        },
      ],
      continueCursor: "cursor-1",
      isDone: false,
      totalCount: 1,
      expenseCount: 1,
      totalExpenseYen: 1200,
    };
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      const cursor =
        typeof args === "object" && args !== null && "paginationOpts" in args
          ? (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
          : null;
      return cursor === "cursor-1" ? new Error("load more failed") : firstPage;
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "支出一覧（1件中 1件を表示）" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "さらに読み込む" }));

    expect(
      screen.getByRole("heading", { name: "支出一覧（1件中 1件を表示）" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("追加の履歴を読み込めませんでした。表示済みの履歴はそのまま残しています。"),
    ).toBeInTheDocument();
  });

  it("履歴検索の支出と収入の一覧は、年をまたぐ結果をそれぞれ年つきで日付を出す", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      return {
        ...emptySearchResult,
        page: [
          {
            _id: "expense-old",
            date: "2023-06-01",
            type: "expense" as const,
            shopName: "古い店",
            amountYen: 900,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#f97316",
            recordType: "expenseEntry" as const,
          },
          {
            _id: "income-older",
            date: "2021-03-15",
            type: "income" as const,
            bankName: "古い銀行",
            amountYen: 300000,
            recordType: "expenseEntry" as const,
          },
        ],
        totalCount: 2,
        expenseCount: 1,
        incomeCount: 1,
        totalExpenseYen: 900,
        totalIncomeYen: 300000,
      };
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    const expenseTable = screen.getByRole("table", { name: "支出の検索結果" });
    expect(within(expenseTable).getByText("2023/6/1")).toBeInTheDocument();
    const incomeTable = screen.getByRole("table", { name: "収入の検索結果" });
    expect(within(incomeTable).getByText("2021/3/15")).toBeInTheDocument();
  });

  it("追加読み込み後も初回の前期間比較を保持する", async () => {
    const user = userEvent.setup();
    const firstPage: ExpenseSearchResult = {
      ...emptySearchResult,
      page: [
        {
          _id: "expense-1",
          date: "2026-08-01",
          type: "expense",
          shopName: "表示済みの店",
          amountYen: 1200,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
        },
      ],
      continueCursor: "cursor-1",
      isDone: false,
      totalCount: 1,
      expenseCount: 1,
      totalExpenseYen: 1200,
      comparison: {
        currentStartDate: "2026-08-01",
        currentEndDate: "2026-08-31",
        previousStartDate: "2026-07-01",
        previousEndDate: "2026-07-31",
        current: {
          count: 1,
          expenseCount: 1,
          incomeCount: 0,
          totalExpenseYen: 1200,
          totalIncomeYen: 0,
          netAmountYen: -1200,
          byCategory: [],
        },
        previous: {
          count: 1,
          expenseCount: 1,
          incomeCount: 0,
          totalExpenseYen: 800,
          totalIncomeYen: 0,
          netAmountYen: -800,
          byCategory: [],
        },
        diffExpenseYen: 400,
        diffIncomeYen: 0,
        diffNetYen: -400,
        categoryChanges: [],
        hasPreviousData: true,
      },
    };
    const secondPage: ExpenseSearchResult = {
      ...firstPage,
      page: [],
      continueCursor: "v1.done",
      isDone: true,
      comparison: null,
    };
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      const cursor =
        typeof args === "object" && args !== null && "paginationOpts" in args
          ? (args as { paginationOpts?: { cursor?: string | null } }).paginationOpts?.cursor
          : null;
      return cursor === "cursor-1" ? secondPage : firstPage;
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "前期間との比較" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "さらに読み込む" }));

    expect(screen.getByRole("heading", { name: "前期間との比較" })).toBeInTheDocument();
  });

  it("件数上限を超えた場合は案内を表示する", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      return { ...emptySearchResult, truncated: true, isDone: false };
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        "件数が多いため、先頭の一部だけを集計しています。期間やキーワードで絞り込んでください。",
      ),
    ).toBeInTheDocument();
  });

  it("無効化済みカテゴリの条件はチップで状態が分かる", () => {
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?categoryId=cat-old"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("カテゴリ: 旧カテゴリ（無効化済み）")).toBeInTheDocument();
  });

  it("無効化済みカテゴリの設定一覧を読み込んでいる間は「読み込み中」と出す", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (_api === "categories-list-for-settings") {
        return undefined;
      }
      if (args === undefined) {
        return [{ _id: "cat-food", name: "食費" }];
      }
      if (args === "skip") {
        return undefined;
      }
      return emptySearchResult;
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?categoryId=cat-old"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("カテゴリ: 読み込み中")).toBeInTheDocument();
  });

  it("下限が上限を超える条件は絞り込めず、項目の近くに理由が出る", async () => {
    const user = userEvent.setup();
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
        <LocationProbe />
        <Routes>
          <Route path="/search" element={<div />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("金額の下限"), "200");
    await user.type(screen.getByLabelText("金額の上限"), "100");
    await user.click(screen.getByRole("button", { name: "絞り込む" }));

    expect(screen.getByText("金額の下限は上限以下にしてください")).toBeInTheDocument();
    expect(screen.getByText("/search")).toBeInTheDocument();
  });

  it("編集中の下書きはチップ削除で消えず、未適用の変更が分かる", async () => {
    const user = userEvent.setup();
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?q=%E5%BA%97&min=1000"]}>
        <ExpenseSearchPage />
        <LocationProbe />
        <Routes>
          <Route path="/search" element={<div />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("金額の上限"), "5000");
    expect(
      screen.getByText("変更はまだ適用されていません。「絞り込む」を押すと反映されます"),
    ).toBeInTheDocument();

    const keywordChip = screen.getByText("キーワード: 店").closest(".MuiChip-root") as HTMLElement;
    await user.click(keywordChip.querySelector(".MuiChip-deleteIcon") as Element);

    expect(screen.getByText("/search?min=1000")).toBeInTheDocument();
    expect(screen.getByLabelText("金額の上限")).toHaveValue("5000");
    expect(
      screen.getByText("変更はまだ適用されていません。「絞り込む」を押すと反映されます"),
    ).toBeInTheDocument();
  });

  it("適用済みの条件が無効なら理由を画面に表示する", () => {
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?min=2000&max=100"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("金額の下限は上限以下にしてください");
  });

  it("0件の空状態から条件をすべてクリアできる", async () => {
    const user = userEvent.setup();
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search?q=%E5%BA%97"]}>
        <ExpenseSearchPage />
        <LocationProbe />
        <Routes>
          <Route path="/search" element={<div />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("条件に合う履歴はありません")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "条件をすべてクリア" }));

    expect(screen.getByText("/search")).toBeInTheDocument();
  });

  it("集計の対象期間を常時表示し、読み込み途中では表示済み件数も出す", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (_api === "categories-list-for-settings") {
        return [{ _id: "cat-food", name: "食費", isActive: true }];
      }
      if (args === undefined) {
        return [];
      }
      if (args === "skip") {
        return undefined;
      }
      return {
        ...emptySearchResult,
        page: [
          {
            _id: "expense-1",
            date: "2026-08-01",
            type: "expense" as const,
            shopName: "店",
            amountYen: 1200,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#f97316",
            recordType: "expenseEntry" as const,
          },
        ],
        isDone: false,
        totalCount: 5,
        expenseCount: 5,
        totalExpenseYen: 1200,
      };
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("対象期間: 全期間")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "支出一覧（5件中 1件を表示）" }),
    ).toBeInTheDocument();
  });

  it("明細が複数あるレシートはグループ単位で表示済み件数を数える", () => {
    useQueryMock.mockImplementation((_api: unknown, args: unknown) => {
      if (_api === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args === undefined) {
        return [];
      }
      return {
        ...emptySearchResult,
        page: [
          {
            _id: "expense-1",
            date: "2026-08-01",
            type: "expense" as const,
            shopName: "店",
            amountYen: 600,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#f97316",
            receiptGroupId: "receipt-1",
            recordType: "expenseEntry" as const,
          },
          {
            _id: "expense-2",
            date: "2026-08-01",
            type: "expense" as const,
            shopName: "店",
            amountYen: 600,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#f97316",
            receiptGroupId: "receipt-1",
            recordType: "expenseEntry" as const,
          },
        ],
        isDone: false,
        totalCount: 1,
        expenseCount: 1,
        totalExpenseYen: 1200,
      };
    });

    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "支出一覧（1件中 1件を表示）" }),
    ).toBeInTheDocument();
  });

  it("条件を絞り込むとURLへ反映し、クリアで戻せる", async () => {
    const user = userEvent.setup();
    renderWithDatePickers(
      <MemoryRouter initialEntries={["/search"]}>
        <ExpenseSearchPage />
        <LocationProbe />
        <Routes>
          <Route path="/search" element={<div />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("キーワード"), "北浜");
    await user.type(screen.getByLabelText("金額の下限"), "9000");
    await user.click(screen.getByRole("button", { name: "絞り込む" }));
    expect(screen.getByText("/search?q=%E5%8C%97%E6%B5%9C&min=9000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "すべてクリア" }));
    expect(screen.getByText("/search")).toBeInTheDocument();
  });
});
