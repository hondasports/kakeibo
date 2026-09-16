import { describe, expect, it } from "vitest";
import {
  formatPrevWeekDiff,
  formatPrevWeekRate,
  formatPrevWeekRatioWithArrow,
} from "./weekComparison";

describe("weekComparison", () => {
  describe("formatPrevWeekDiff", () => {
    it("差額をフォーマットする", () => {
      expect(formatPrevWeekDiff(-3340)).toBe("-3,340円");
      expect(formatPrevWeekDiff(0)).toBe("±0円");
      expect(formatPrevWeekDiff(null)).toBe("比較データなし");
    });
  });

  describe("formatPrevWeekRate", () => {
    it("増減率をフォーマットする", () => {
      expect(formatPrevWeekRate(-8)).toBe("-8%");
      expect(formatPrevWeekRate(0)).toBe("±0%");
      expect(formatPrevWeekRate(null)).toBe("前週データなし");
    });
  });

  describe("formatPrevWeekRatioWithArrow", () => {
    it("前週比（指数）に矢印を付けてフォーマットする", () => {
      expect(formatPrevWeekRatioWithArrow(92)).toBe("92% ↓");
      expect(formatPrevWeekRatioWithArrow(109)).toBe("109% ↑");
      expect(formatPrevWeekRatioWithArrow(1200)).toBe("1200% ↑");
      expect(formatPrevWeekRatioWithArrow(100)).toBe("100%");
      expect(formatPrevWeekRatioWithArrow(null)).toBe("前週データなし");
    });
  });
});
