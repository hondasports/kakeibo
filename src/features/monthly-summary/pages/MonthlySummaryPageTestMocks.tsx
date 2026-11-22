import { useCallback, useRef } from "react";
import { beforeEach, vi } from "vitest";
import type { NavigateOptions } from "react-router-dom";
import { apiMockWith } from "../../../test/apiMock";

const useQueryMock = vi.hoisted(() => vi.fn());
const useQueryExperimentalMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const navigateMock = vi.hoisted(() => vi.fn());
const routeMonth = vi.hoisted(() => ({ value: "2026-07" as string | undefined }));

vi.mock("../../../../lib/domain/common/month", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/domain/common/month")>();
  return { ...actual, getCurrentMonth: () => "2026-08" };
});

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => useMutationMock(),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useQuery_experimental: (...args: unknown[]) => useQueryExperimentalMock(...args),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({ "users.queries.getUserProfile": "get-user-profile" }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    // 呼び出しを記録しつつ、実際のルーターでも遷移させる（URL の ?date= 反映を確かめるため）
    // 参照は安定させる（ページの useEffect が再実行され続けて無限遷移になるのを防ぐ）
    useNavigate: () => {
      const navigate = actual.useNavigate();
      const latestNavigate = useRef(navigate);
      latestNavigate.current = navigate;
      return useCallback((to: string, options?: NavigateOptions) => {
        navigateMock(...(options ? [to, options] : [to]));
        latestNavigate.current(to, options);
      }, []);
    },
    useParams: () => ({ month: routeMonth.value }),
  };
});

beforeEach(() => {
  routeMonth.value = "2026-07";
  useMutationMock.mockReset();
  useMutationMock.mockImplementation(() => vi.fn());
  useQueryExperimentalMock.mockReset();
  useQueryExperimentalMock.mockImplementation((options: { query: unknown; args: unknown }) => {
    if (options.query === "get-user-profile") {
      return { status: "success", data: { weeklyStartDay: 3 } };
    }
    return {
      status: "success",
      data: [
        { _id: "category-food", name: "食費" },
        { _id: "category-daily", name: "日用品" },
      ],
    };
  });
  useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
    if (_query === "get-user-profile") {
      return { weeklyStartDay: 3 };
    }
    if (args && typeof args === "object" && "month" in args) {
      return {
        byCategory: [
          {
            categoryColor: "#8B5E3C",
            categoryId: "category-food",
            categoryName: "食費",
            count: 1,
            totalAmountYen: 1200,
          },
        ],
        count: 1,
        incomeCount: 1,
        incomes: [
          {
            _id: "income-1",
            amountYen: 50000,
            bankName: "給与口座",
            date: "2026-07-25",
            memo: undefined,
            recordType: "expenseEntry",
            type: "income",
          },
        ],
        netAmountYen: 48800,
        receipts: [
          {
            _id: "expense-1",
            amountYen: 1200,
            categoryColor: "#8B5E3C",
            categoryId: "category-food",
            categoryName: "食費",
            date: "2026-07-10",
            memo: undefined,
            recordType: "expenseEntry",
            shopName: "スーパー",
            type: "expense",
          },
        ],
        totalAmountYen: 1200,
        totalIncomeYen: 50000,
      };
    }
    return [{ _id: "category-food", name: "食費" }];
  });
  navigateMock.mockReset();
});

export { useQueryMock, useQueryExperimentalMock, useMutationMock, navigateMock, routeMonth };
