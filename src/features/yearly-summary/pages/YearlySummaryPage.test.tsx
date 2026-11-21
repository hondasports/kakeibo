import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithDatePickers } from "../../../test/render";
import { YearlySummaryPage } from "./YearlySummaryPage";

const useQueryMock = vi.hoisted(() => vi.fn());
const useQueryExperimentalMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routeYear = vi.hoisted(() => ({ value: "2025" as string | undefined }));

vi.mock("../../../../lib/domain/common/year", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/domain/common/year")>();
  return { ...actual, getCurrentYear: () => "2026" };
});

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useQuery_experimental: (...args: unknown[]) => useQueryExperimentalMock(...args),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ year: routeYear.value }),
  };
});

const summaryResult = {
  byCategory: [
    {
      categoryColor: "#8B5E3C",
      categoryId: "food",
      categoryName: "食費",
      count: 1,
      totalAmountYen: 3000,
    },
  ],
  count: 1,
  incomeCount: 1,
  months: Array.from({ length: 12 }, (_, index) => ({
    byCategory:
      index === 7
        ? [
            {
              categoryColor: "#8B5E3C",
              categoryId: "food",
              categoryName: "食費",
              count: 1,
              totalAmountYen: 3000,
            },
          ]
        : [],
    count: index === 7 ? 1 : 0,
    incomeCount: index === 7 ? 1 : 0,
    month: `2025-${String(index + 1).padStart(2, "0")}`,
    netAmountYen: index === 7 ? 177000 : 0,
    totalAmountYen: index === 7 ? 3000 : 0,
    totalIncomeYen: index === 7 ? 180000 : 0,
  })),
  netAmountYen: 177000,
  totalAmountYen: 3000,
  totalIncomeYen: 180000,
  year: "2025",
};

function renderPage() {
  return renderWithDatePickers(
    <MemoryRouter>
      <YearlySummaryPage />
    </MemoryRouter>,
  );
}

describe("YearlySummaryPage", () => {
  beforeEach(() => {
    routeYear.value = "2025";
    navigateMock.mockReset();
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue(summaryResult);
    useQueryExperimentalMock.mockReset();
    useQueryExperimentalMock.mockReturnValue({ status: "success", data: { weeklyStartDay: 0 } });
  });

  it("年次サマリーの指標・グラフ・月次導線を表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "年次サマリー" })).toBeInTheDocument();
    expect(screen.getByLabelText("支出")).toHaveTextContent("3,000円");
    expect(screen.getByLabelText("収入")).toHaveTextContent("180,000円");
    expect(screen.getByRole("heading", { name: "月ごとの収支推移" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "年間の支出カテゴリ" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2025年8月/ })).toHaveAttribute(
      "href",
      "/months/2025-08",
    );
  });

  it("不正な年や未来年は今年へ正規化する", () => {
    routeYear.value = "2099";
    renderPage();

    expect(navigateMock).toHaveBeenCalledWith("/years/2026", { replace: true });
  });

  it("年パラメータが無いときも今年へ正規化する", () => {
    routeYear.value = undefined;
    renderPage();

    expect(navigateMock).toHaveBeenCalledWith("/years/2026", { replace: true });
  });

  it("前年へ移動できる", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "前年へ" }));
    expect(navigateMock).toHaveBeenCalledWith("/years/2024");
  });

  it("次年と今年へ移動できる", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "次年へ" }));
    expect(navigateMock).toHaveBeenCalledWith("/years/2026");

    await user.click(screen.getByRole("button", { name: "今年へ" }));
    expect(navigateMock).toHaveBeenCalledWith("/years/2026");
  });

  it("年ピッカーの未来年は今年へ正規化する", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /表示する年を選ぶ/ }));
    await user.click(screen.getByRole("radio", { name: /^2026$/ }));
    expect(navigateMock).toHaveBeenCalledWith("/years/2026");
  });

  it("月次データが空でも12ヶ月分の導線を出す", () => {
    useQueryMock.mockReturnValue({
      ...summaryResult,
      months: [],
    });
    renderPage();

    expect(screen.getByRole("link", { name: /2025年1月/ })).toHaveAttribute(
      "href",
      "/months/2025-01",
    );
    expect(screen.getByRole("link", { name: /2025年12月/ })).toHaveAttribute(
      "href",
      "/months/2025-12",
    );
  });

  it("読み込み中は指標スケルトンを表示する", () => {
    useQueryMock.mockReturnValue(undefined);
    renderPage();

    expect(screen.getByTestId("yearly-trend-chart-loading")).toBeInTheDocument();
  });
});
