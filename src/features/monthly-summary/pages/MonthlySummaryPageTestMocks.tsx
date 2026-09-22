import { beforeEach, vi } from "vitest";
import { apiMockWith } from "../../../test/apiMock";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const navigateMock = vi.hoisted(() => vi.fn());
const routeMonth = vi.hoisted(() => ({ value: "2026-07" as string | undefined }));

vi.mock("../../../../lib/domain/common/month", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/domain/common/month")>();
  return { ...actual, getCurrentMonth: () => "2026-08" };
});

vi.mock("convex/react", () => ({
  useMutation: () => useMutationMock(),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({ "users.queries.getUserProfile": "get-user-profile" }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ month: routeMonth.value }),
  };
});

beforeEach(() => {
  routeMonth.value = "2026-07";
  useMutationMock.mockReset();
  useMutationMock.mockImplementation(() => vi.fn());
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

export { useQueryMock, useMutationMock, navigateMock, routeMonth };
