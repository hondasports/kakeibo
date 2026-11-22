import type { ReceiptRawObservationLine } from "../observations";
import { taxSummaryLineKind } from "./summaryEvidence";

const LABELED_AMOUNT = /[¥￥]\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\s*円)?|(\d{1,3}(?:,\d{3})+|\d+)\s*円/g;
const RATE_PREFIX = /^(\d+(?:\.\d+)?%)/;
const ENCLOSING_PARENS = /^\((.*)\)$/;
// 符号・小数・判読できない桁が隣接する金額は、数字の一部だけを読むことになるので分けない。
const UNSAFE_BEFORE = /[-−▲△\d.,?？]$/;
const UNSAFE_AFTER = /^[\d.,?？]/;

function amounts(text: string): { yen: number; start: number; end: number }[] | undefined {
  const found = [...text.matchAll(LABELED_AMOUNT)].map((match) => ({
    yen: Number((match[1] ?? match[2]).replace(/,/g, "")),
    start: match.index,
    end: match.index + match[0].length,
  }));
  const unsafe = found.some(
    (amount) =>
      UNSAFE_BEFORE.test(text.slice(0, amount.start).trimEnd()) ||
      UNSAFE_AFTER.test(text.slice(amount.end)),
  );
  return unsafe ? undefined : found;
}

/**
 * 「10%税抜 ¥220 消費税等 ¥22」のように対象額と税額が1行に並ぶ行を、ラベルごとの行に分ける。
 * ラベルと金額が一意に対応しない行は分けず、読めない税の根拠として残す。
 */
function splitCombinedLine(line: ReceiptRawObservationLine): ReceiptRawObservationLine[] {
  if (!line.amountText) return [line];
  const rawText = line.rawText.normalize("NFKC").trim();
  const text = (ENCLOSING_PARENS.exec(rawText)?.[1] ?? rawText).trim();
  const printed = amounts(text);
  if (printed?.length !== 2) return [line];
  // 行内のどの金額とも違う amountYen は、別の行の金額と取り違えている可能性があるので分けない。
  if (line.amountYen !== null && !printed.some((amount) => amount.yen === line.amountYen))
    return [line];
  const reported = amounts(line.amountText.normalize("NFKC"))?.map((amount) => amount.yen);
  if (reported?.join() !== printed.map((amount) => amount.yen).join()) return [line];
  if (text.slice(printed[1].end).trim() !== "") return [line];

  const labels = [
    text.slice(0, printed[0].start).trim(),
    text.slice(printed[0].end, printed[1].start).trim(),
  ];
  const kinds = labels.map(taxSummaryLineKind);
  if (!kinds.includes("target") || !kinds.includes("tax")) return [line];

  // 税率は行頭にだけ印字されるので、後ろのラベルにも同じ税率を付けて税率別の根拠にする。
  const rate = RATE_PREFIX.exec(labels[0].replace(/\s+/g, ""))?.[1];
  return labels.map((label, index) => {
    const amountText = text.slice(printed[index].start, printed[index].end);
    const rawLabel = index > 0 && rate && !label.includes("%") ? `${rate}${label}` : label;
    return {
      ...line,
      rawText: `${rawLabel} ${amountText}`,
      amountText,
      amountYen: printed[index].yen,
    };
  });
}

export function splitCombinedSummaryLines(
  lines: ReceiptRawObservationLine[] | undefined,
): ReceiptRawObservationLine[] | undefined {
  return lines?.flatMap(splitCombinedLine);
}
