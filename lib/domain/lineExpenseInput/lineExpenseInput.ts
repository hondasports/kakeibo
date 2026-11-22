/**
 * LINEテキストからの支出入力解析。「コンビニ 500」「食費 1,200円」
 * 「500 コンビニ」のような「内容＋金額」だけを受理する。
 * 金額が無い文や内容の無い金額だけは支出入力とみなさない。
 */
import {
  EXPENSE_ENTRY_AMOUNT_MAX,
  EXPENSE_ENTRY_TITLE_MAX_LENGTH,
} from "../expenseEntries/expenseEntryItem";

export type LineExpenseInput = {
  /** 店名・内容（支出下書きの shopName/itemName として使う） */
  title: string;
  amountYen: number;
};

const COMMAND_WORDS = new Set([
  "合計",
  "支出",
  "収入",
  "サマリー",
  "家計簿",
  "内訳",
  "推移",
  "カテゴリ",
  "カテゴリー",
  "カテゴリ別",
  "カテゴリー別",
  "レシート",
  "使い方",
  "help",
  "今週",
  "今週の家計",
  "今週の支出",
  "今週の収入",
  "週別推移",
  "週次推移",
]);

const FULL_WIDTH_DIGITS = "０１２３４５６７８９";
const AMOUNT_PATTERN = /([0-9０-９][0-9０-９,]*)円?/g;

function toHalfWidthDigits(value: string): string {
  return [...value]
    .map((ch) => {
      const index = FULL_WIDTH_DIGITS.indexOf(ch);
      return index >= 0 ? String(index) : ch;
    })
    .join("");
}

/** メッセージを支出入力として解析する。解釈できなければ null。 */
export function parseLineExpenseInput(messageText: string): LineExpenseInput | null {
  const text = messageText.trim();
  if (text.length === 0) return null;

  // 「内容 金額」が基本形。金額は空白・端で区切られた独立した数字列のみ
  // （「100均」の100のように語に食い込んだ数字は内容の一部）。
  // 独立した数字列が複数ある入力は金額が一意に決まらないため受理しない。
  const matches = [...text.matchAll(AMOUNT_PATTERN)];
  const standalone = matches.filter((m) => {
    const index = m.index ?? -1;
    const before = index <= 0 ? " " : (text[index - 1] ?? "");
    const after = text[index + m[0].length] ?? " ";
    const boundedBefore = /\s/.test(before);
    const boundedAfter = after === "" || /\s/.test(after);
    // 「円」付きは語に食い込んでいても金額（「電車代４００円」）。
    // 「円」無しは両側を空白・端で区切られたものだけ（「100均」の100は弾く）。
    return m[0].endsWith("円") ? boundedAfter : boundedBefore && boundedAfter;
  });
  if (standalone.length !== 1) return null;
  const amountMatch = standalone[0];
  const amountIndex = amountMatch.index ?? 0;
  const amountYen = Number(toHalfWidthDigits(amountMatch[1]).replace(/,/g, ""));
  if (!Number.isInteger(amountYen) || amountYen <= 0 || amountYen > EXPENSE_ENTRY_AMOUNT_MAX) {
    return null;
  }

  // 金額トークンと「円」を取り除いた残りを内容とする
  const title = (text.slice(0, amountIndex) + " " + text.slice(amountIndex + amountMatch[0].length))
    .replace(/円/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (title.length === 0 || title.length > EXPENSE_ENTRY_TITLE_MAX_LENGTH) return null;
  // 数字だけの内容（電話番号・日付のような数値列）は支出入力とみなさない
  if (!/[^0-9０-９\s,]/.test(title)) return null;
  // サマリーコマンド語だけの内容は支出入力とみなさない
  if (COMMAND_WORDS.has(title.toLowerCase())) return null;

  return { title, amountYen };
}
