import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { HistoryCategoryChart } from "./HistoryCategoryChart";

// jsdom では描画領域の幅が0になり横軸の目盛り文字が出ないため、BarChart に渡す props を直接確かめる。
const barChartProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("@mui/x-charts/BarChart", () => ({
  BarChart: (props: Record<string, unknown>) => {
    barChartProps.current = props;
    return null;
  },
}));

describe("HistoryCategoryChart", () => {
  it("横軸の目盛りは最大値に合わせて全部を万円で表し、最後の目盛りが切れない右余白を取る", () => {
    renderWithProviders(
      <HistoryCategoryChart
        categories={[
          {
            categoryId: "food",
            categoryName: "食費",
            categoryColor: "#f97316",
            totalAmountYen: 16_000,
            count: 1,
          },
          {
            categoryId: "daily",
            categoryName: "日用品",
            categoryColor: "#a6b28b",
            totalAmountYen: 4_000,
            count: 1,
          },
        ]}
      />,
    );

    const props = barChartProps.current as Record<string, unknown>;
    const xAxis = (props.xAxis as Array<{ valueFormatter: (value: number | null) => string }>)[0];
    const margin = props.margin as { right: number };
    const ticks = [0, 4_000, 8_000, 12_000, 16_000].map((tick) => xAxis.valueFormatter(tick));

    expect(ticks).toEqual(["0万円", "0.4万円", "0.8万円", "1.2万円", "1.6万円"]);
    expect(margin.right).toBeGreaterThan(12);
  });
});
