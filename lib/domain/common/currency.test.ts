import { describe, expect, it } from "vitest";
import { formatYen, formatYenAbs, formatYenCompact } from "./currency";

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
