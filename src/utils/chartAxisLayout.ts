import { formatYenAxisTick } from "../../lib/domain/common/currency";

// MUI X Charts の目盛り文字（既定 12px 前後）の幅を文字種ごとに概算する。
// 実測ではなく見積もりなので、固定幅で切れていた旧実装より十分に広く取ることを優先する。
const DIGIT_PX = 7;
const ASCII_SYMBOL_PX = 4;
const WIDE_CHAR_PX = 13;
// 目盛り線と文字の間隔と、右端の余裕。
const Y_AXIS_TICK_SPACE_PX = 14;
const VALUE_AXIS_END_PADDING_PX = 4;

export function estimateTickLabelWidth(label: string): number {
  let width = 0;
  for (const char of label) {
    if (/[0-9]/.test(char)) {
      width += DIGIT_PX;
    } else if (char.charCodeAt(0) < 128) {
      width += ASCII_SYMBOL_PX;
    } else {
      width += WIDE_CHAR_PX;
    }
  }
  return width;
}

/** 縦軸の幅。最も長い目盛りが切れずに入る幅を返す。 */
export function yAxisWidthForLabels(labels: readonly string[]): number {
  if (labels.length === 0) {
    return 0;
  }
  const longest = Math.max(...labels.map(estimateTickLabelWidth));
  return Math.ceil(longest + Y_AXIS_TICK_SPACE_PX);
}

/**
 * 横軸（値軸）の右余白。最後の目盛りは中央揃えで右側へはみ出すため、
 * 最も長い目盛りの半分と余裕を確保する。
 */
export function valueAxisEndMargin(labels: readonly string[]): number {
  if (labels.length === 0) {
    return 0;
  }
  const longest = Math.max(...labels.map(estimateTickLabelWidth));
  return Math.ceil(longest / 2) + VALUE_AXIS_END_PADDING_PX;
}

/**
 * 軸の最大値から、表示されうる目盛りの文字列を候補として作る。
 * MUI が選ぶ目盛りの最大値は正確には分からないため、最大値・その1.25倍・次の桁の値を候補にして最も長いものを使う。
 */
export function yenAxisTickLabels(axisMaxYen: number): string[] {
  const max = Math.max(axisMaxYen, 1);
  const nextPowerOfTen = 10 ** Math.ceil(Math.log10(max));
  return [
    formatYenAxisTick(0, axisMaxYen),
    formatYenAxisTick(max, axisMaxYen),
    formatYenAxisTick(max * 1.25, axisMaxYen),
    formatYenAxisTick(nextPowerOfTen, axisMaxYen),
  ];
}

type ChartRow = Record<string, string | number>;

/**
 * 積み上げ棒・面グラフの軸の最大値。描く系列（キー）の値を行ごとに足し、その最大を返す。
 * 描かない系列（収入など）は keys に含めないので、軸の単位の判定に混ざらない。
 */
export function stackedMaxYen(rows: readonly ChartRow[], dataKeys: readonly string[]): number {
  return rows.reduce((max, row) => {
    const total = dataKeys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
    return Math.max(max, total);
  }, 0);
}

/** 並べて描く系列（グループ棒・折れ線）の軸の最大値。描く系列の値のうち最大を返す。 */
export function groupedMaxYen(rows: readonly ChartRow[], dataKeys: readonly string[]): number {
  return rows.reduce(
    (max, row) => dataKeys.reduce((current, key) => Math.max(current, Number(row[key] ?? 0)), max),
    0,
  );
}
