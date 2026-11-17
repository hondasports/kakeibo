import { describe, expect, it } from "vitest";
import {
  formatSignedYen,
  formatYen,
  formatYenAbs,
  formatYenAxisTick,
  formatYenCompact,
} from "./currency";

describe("formatYen", () => {
  it("正の数値を円付きでフォーマットする", () => {
    expect(formatYen(1234)).toBe("1,234円");
  });

  it("負の数値はマイナス付きでフォーマットする", () => {
    expect(formatYen(-1234)).toBe("-1,234円");
  });

  it("0 は 0円 と返す", () => {
    expect(formatYen(0)).toBe("0円");
  });
});

describe("formatYenAbs", () => {
  it("負の数値も絶対値を返す", () => {
    expect(formatYenAbs(-1234)).toBe("1,234円");
  });

  it("正の数値はそのまま", () => {
    expect(formatYenAbs(1234)).toBe("1,234円");
  });
});

describe("formatSignedYen", () => {
  it("正の数値は + 付きでフォーマットする", () => {
    expect(formatSignedYen(1234)).toBe("+1,234円");
  });

  it("負の数値は − 付きでフォーマットする", () => {
    expect(formatSignedYen(-1234)).toBe("−1,234円");
  });

  it("0 は符号なしの 0円 と返す", () => {
    expect(formatSignedYen(0)).toBe("0円");
  });
});

describe("formatYenCompact", () => {
  it("1万円未満は通常の円表記", () => {
    expect(formatYenCompact(9999)).toBe("9,999円");
  });

  it("1万円の場合は 1万円", () => {
    expect(formatYenCompact(10_000)).toBe("1万円");
  });

  it("1.2万円を小数点第1位で表記", () => {
    expect(formatYenCompact(12_500)).toBe("1.3万円");
  });

  it("負の値も圧縮表記", () => {
    expect(formatYenCompact(-12_500)).toBe("-1.3万円");
  });
});

describe("formatYenAxisTick", () => {
  it("軸の最大値が1万円未満なら全目盛りを円で表す", () => {
    expect(formatYenAxisTick(0, 9_999)).toBe("0円");
    expect(formatYenAxisTick(6_000, 9_999)).toBe("6,000円");
  });

  it("軸の最大値がちょうど1万円なら全目盛りを万円で表す", () => {
    expect(formatYenAxisTick(0, 10_000)).toBe("0万円");
    expect(formatYenAxisTick(10_000, 10_000)).toBe("1万円");
  });

  it("万円表記で小数になる目盛りは小数第1位まで表す", () => {
    expect(formatYenAxisTick(5_000, 20_000)).toBe("0.5万円");
    expect(formatYenAxisTick(12_500, 20_000)).toBe("1.3万円");
  });

  it("同じ軸の中で円と万円が混ざらない", () => {
    const ticks = [0, 4_000, 8_000, 12_000, 16_000].map((tick) => formatYenAxisTick(tick, 16_000));
    expect(ticks.every((tick) => tick.endsWith("万円"))).toBe(true);
    expect(ticks).toEqual(["0万円", "0.4万円", "0.8万円", "1.2万円", "1.6万円"]);
  });
});
