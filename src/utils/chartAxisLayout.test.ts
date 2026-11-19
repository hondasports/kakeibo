import { describe, expect, it } from "vitest";
import {
  estimateTickLabelWidth,
  groupedMaxYen,
  stackedMaxYen,
  valueAxisEndMargin,
  yAxisWidthForLabels,
  yenAxisTickLabels,
} from "./chartAxisLayout";

describe("estimateTickLabelWidth", () => {
  it("全角の単位を含む目盛りは数字だけより幅を取る", () => {
    expect(estimateTickLabelWidth("6,000円")).toBeGreaterThan(estimateTickLabelWidth("6,000"));
  });

  it("桁が増えるほど幅が広がる", () => {
    expect(estimateTickLabelWidth("10,000円")).toBeGreaterThan(estimateTickLabelWidth("6,000円"));
  });
});

describe("yAxisWidthForLabels", () => {
  it("最も長い目盛りが入る幅を返す（旧固定幅52pxでは6,000円が入らなかった）", () => {
    expect(yAxisWidthForLabels(["0円", "2,000円", "4,000円", "6,000円"])).toBeGreaterThan(52);
  });

  it("目盛りが空なら0を返す", () => {
    expect(yAxisWidthForLabels([])).toBe(0);
  });
});

describe("valueAxisEndMargin", () => {
  it("横軸の最後の目盛りが右端からはみ出さない余白を返す", () => {
    expect(valueAxisEndMargin(["0万円", "2万円", "4万円"])).toBeGreaterThanOrEqual(
      Math.ceil(estimateTickLabelWidth("4万円") / 2),
    );
  });
});

describe("yenAxisTickLabels", () => {
  it("軸の最大値が1万円以上なら候補の目盛りもすべて万円で表す", () => {
    expect(yenAxisTickLabels(16_000).every((label) => label.endsWith("万円"))).toBe(true);
  });

  it("軸の最大値が1万円未満なら候補の目盛りは円で表す", () => {
    expect(
      yenAxisTickLabels(6_000).every((label) => label.endsWith("円") && !label.includes("万")),
    ).toBe(true);
  });
});

describe("stackedMaxYen", () => {
  it("積み上げの月ごとの合計の最大を返す", () => {
    const rows = [
      { label: "1月", a: 100, b: 200 },
      { label: "2月", a: 150, b: 50 },
    ];
    expect(stackedMaxYen(rows, ["a", "b"])).toBe(300);
  });

  it("描かれない系列（キー一覧に無い値）は含めない", () => {
    const rows = [{ label: "1月", a: 300, income: 180_000 }];
    expect(stackedMaxYen(rows, ["a"])).toBe(300);
  });

  it("行が無ければ0を返す", () => {
    expect(stackedMaxYen([], ["a"])).toBe(0);
  });
});

describe("groupedMaxYen", () => {
  it("並べて描く系列のうち最大の値を返す", () => {
    const rows = [
      { label: "1月", expense: 300, income: 180_000 },
      { label: "2月", expense: 5_000, income: 1_000 },
    ];
    expect(groupedMaxYen(rows, ["expense", "income"])).toBe(180_000);
  });
});
