import { describe, expect, it } from "vitest";
import { designTokens } from "../../../designTokens";
import { EXPENSE_INTENSITY_ALPHA, getExpenseCellTextColor } from "../utils/monthlySpendingCalendar";

// WCAG 2.1 の相対輝度とコントラスト比。
function toLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((index) =>
    toLinear(Number.parseInt(value.slice(index, index + 2), 16)),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foregroundHex: string, backgroundRgb: [number, number, number]): number {
  const background = backgroundRgb.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  const lighter = Math.max(relativeLuminance(foregroundHex), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foregroundHex), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

// 半透明の primary を、カレンダー下地（surface.panel）に重ねた実際の色。
function blendOverPanel(alphaValue: number): [number, number, number] {
  const primary = designTokens.color.primary.main.replace("#", "");
  const panel = designTokens.color.surface.panel.replace("#", "");
  return [0, 2, 4].map((index) => {
    const primaryChannel = Number.parseInt(primary.slice(index, index + 2), 16);
    const panelChannel = Number.parseInt(panel.slice(index, index + 2), 16);
    return Math.round(primaryChannel * alphaValue + panelChannel * (1 - alphaValue));
  }) as [number, number, number];
}

describe("MonthlySpendingCalendar の文字コントラスト", () => {
  it("すべての濃さで、金額の文字が背景に対して 4.5:1 以上になる", () => {
    for (const [intensity, alphaValue] of EXPENSE_INTENSITY_ALPHA.entries()) {
      if (intensity === 0) {
        continue;
      }
      const textColor = getExpenseCellTextColor();
      const ratio = contrastRatio(textColor, blendOverPanel(alphaValue));
      expect(ratio, `濃さ${intensity}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("濃さ4（最も濃い背景）の計算値が仕様どおりに得られる", () => {
    // 背景は RGB(188,161,139) になる（issue の実測値と一致することの確認）。
    expect(blendOverPanel(EXPENSE_INTENSITY_ALPHA[4])).toEqual([188, 161, 139]);
  });
});
