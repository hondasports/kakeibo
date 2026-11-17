import { describe, expect, it } from "vitest";
import {
  estimateTickLabelWidth,
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
