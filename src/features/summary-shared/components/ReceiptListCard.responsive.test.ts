import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SMARTPHONE_QUERY = "@media not all and (min-width: 900px)";

/** `@media not all and (min-width: 900px)` ブロックの本体だけを集め、残りをPC用のCSSとして分ける */
function splitSmartphoneStyles(source: string) {
  let desktop = "";
  let mobile = "";
  let cursor = 0;
  for (
    let start = source.indexOf(SMARTPHONE_QUERY);
    start !== -1;
    start = source.indexOf(SMARTPHONE_QUERY, cursor)
  ) {
    desktop += source.slice(cursor, start);
    const bodyStart = source.indexOf("{", start) + 1;
    let depth = 1;
    let end = bodyStart;
    while (depth > 0 && end < source.length) {
      depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0;
      end += 1;
    }
    if (depth !== 0) {
      throw new Error(`${SMARTPHONE_QUERY} ブロックの波括弧が閉じていません`);
    }
    mobile += source.slice(bodyStart, end - 1);
    cursor = end;
  }
  return { desktop: desktop + source.slice(cursor), mobile };
}

/** `header`（例: `@media (min-width: 900px) {`）で始まるブロックの本体を、対応する閉じ括弧まで取り出す */
function closingBraceIndex(source: string, from: number) {
  let depth = 1;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("閉じ括弧が見つかりません");
}

function mediaBlockBodies(source: string, header: string) {
  const bodies: string[] = [];
  let cursor = 0;
  for (let start = source.indexOf(header); start !== -1; start = source.indexOf(header, cursor)) {
    const bodyStart = source.indexOf("{", start) + 1;
    const bodyEnd = closingBraceIndex(source, bodyStart);
    bodies.push(source.slice(bodyStart, bodyEnd));
    cursor = bodyEnd + 1;
  }
  return bodies;
}

/** `@media` ブロックを取り除き、どのメディアクエリにも入らない通常のCSSだけを返す */
function stripMediaBlocks(source: string) {
  let top = "";
  let cursor = 0;
  for (
    let start = source.indexOf("@media");
    start !== -1;
    start = source.indexOf("@media", cursor)
  ) {
    top += source.slice(cursor, start);
    cursor = closingBraceIndex(source, source.indexOf("{", start) + 1) + 1;
  }
  return top + source.slice(cursor);
}

describe("ReceiptListCard responsive styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
  const { desktop, mobile } = splitSmartphoneStyles(css);
  const pcCss = mediaBlockBodies(css, "@media (min-width: 900px) {").join("\n");
  const topLevelCss = stripMediaBlocks(css);

  it("PC一覧では日付と金額を詰めて店名・内訳の幅を広げる", () => {
    expect(css).toMatch(/grid-template-columns:\s*88px minmax\(200px, 1fr\) 104px 184px/);
  });

  it("選択可能な週次一覧だけチェックボックス列を足す", () => {
    expect(css).toMatch(
      /\.receipt-list--selectable \.receipt-list-header[\s\S]*grid-template-columns:\s*44px 88px minmax\(200px, 1fr\) 104px 184px/,
    );
  });

  it("収入一覧は独立したメモ列の幅をスマートフォン幅の外でだけ維持する", () => {
    expect(css).toMatch(
      /@media \(min-width: 900px\)\s*\{\s*\.receipt-list--income \.receipt-list-header--income,\s*\.receipt-list--income \.receipt-row\s*\{[^}]*88px minmax\(156px, 1\.3fr\) 104px minmax\(140px, 1fr\)\s*184px/,
    );
  });

  it("収入一覧のPC用の列指定をメディアクエリの外に置かない（スマートフォンの縦積みを詳細度で上書きして横スクロールを出すため）", () => {
    expect(css).not.toMatch(/^\.receipt-list--income \.receipt-(?:list-header--income|row)\b/m);
  });

  it("長い店名でもグリッド列からはみ出さない", () => {
    expect(css).toMatch(/\.receipt-row-name\s*\{[^}]*min-width:\s*0/);
  });

  it("Chipと店名をセル内で折り返し、各要素の幅を制限する", () => {
    expect(css).toMatch(/\.receipt-row-identity\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.receipt-row-identity\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.receipt-row-identity\s*>\s*\*\s*\{[^}]*max-width:\s*100%/);
  });

  it("PCの明細行は共通の列幅を維持し、名前セルだけをインデントする", () => {
    expect(desktop).not.toMatch(/\.receipt-row--detail\s*\{[^}]*padding(?:-left)?:/);
    expect(desktop).toMatch(/\.receipt-row--detail \.receipt-row-name\s*\{[^}]*padding-left:/);
  });

  it("スマートフォンでは支出の親行と明細行の日付・金額を上に揃える", () => {
    expect(mobile).toMatch(
      /\.receipt-list:not\(\.receipt-list--income\) \.receipt-row-date,\s*\.receipt-list:not\(\.receipt-list--income\) \.receipt-row-amount\s*\{[^}]*align-self:\s*start/,
    );
  });

  it("スマートフォンの支出はメモ段を設けず選択欄を上に揃える", () => {
    expect(mobile).toMatch(
      /\.receipt-list--selectable \.receipt-row-select\s*\{[^}]*align-self:\s*start/,
    );
    expect(mobile).toMatch(
      /\.receipt-list--selectable:not\(\.receipt-list--income\) \.receipt-row\s*\{[^}]*"select date name amount" "select actions actions actions"/,
    );
  });

  it("年つきの履歴一覧だけPCの日付の列を104pxに広げ、操作なし・選択ありの組み合わせも覆う", () => {
    expect(pcCss).toMatch(
      /\.receipt-list--with-year \.receipt-row[^{]*\{[^}]*104px minmax\(200px, 1fr\) 104px 184px/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*104px minmax\(200px, 1fr\) 104px;/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--selectable\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*44px 104px minmax\(200px, 1fr\) 104px;/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--income\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*104px minmax\(156px, 1\.3fr\) 104px minmax\(140px, 1fr\);/,
    );
  });

  it("年つきの列幅の指定はPCのメディアクエリの外・スマートフォンのブロックのどちらにも置かない", () => {
    expect(topLevelCss).not.toMatch(/\.receipt-list--with-year[^{]*\{[^}]*104px/);
    expect(mobile).not.toMatch(/with-year/);
  });

  it("年つきの日付のセルは全幅で折り返さない（週次・月次の「月/日」には効かせない）", () => {
    expect(topLevelCss).toMatch(
      /\.receipt-list--with-year \.receipt-row-date\s*\{[^}]*white-space:\s*nowrap/,
    );
    expect(css).not.toMatch(/(^|\n)\.receipt-row-date\s*\{[^}]*nowrap/);
  });
});
