import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SMARTPHONE_QUERY = "@media not all and (min-width: 900px)";
const NARROW_PC_QUERY = "@media (min-width: 900px) and (max-width: 1199px)";

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

/** メディアブロックの本体から「セレクタ { 宣言 }」の組を取り出す */
function cssRules(body: string) {
  const rules: { selector: string; declarations: string }[] = [];
  for (const match of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: match[1].trim(), declarations: match[2] });
  }
  return rules;
}

/** `grid-template-columns` の宣言から固定幅トラックの合計と列間gapの合計をpxで返す（minmax(0, …) の可変列は0として扱う） */
function fixedTracksPx(declarations: string) {
  const columns = declarations.match(/grid-template-columns:\s*([^;]+);/)?.[1] ?? "";
  const tracks = columns.match(/minmax\([^)]*\)|\d+(?:\.\d+)?px/g) ?? [];
  const fixedPx = tracks
    .filter((track) => !track.startsWith("minmax"))
    .reduce((sum, track) => sum + Number.parseFloat(track), 0);
  // gap: var(--space-md) = 16px（designTokens.space.md）
  return { fixedPx, gapPx: (tracks.length - 1) * 16 };
}

describe("ReceiptListCard responsive styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
  const { desktop, mobile } = splitSmartphoneStyles(css);
  const pcCss = mediaBlockBodies(css, "@media (min-width: 900px) {").join("\n");
  const topLevelCss = stripMediaBlocks(css);

  it("PC一覧では日付と金額を詰めて店名・内訳の幅を広げる", () => {
    expect(css).toMatch(/grid-template-columns:\s*88px minmax\(0, 1fr\) 104px 184px/);
  });

  it("選択可能な週次一覧だけチェックボックス列を足す", () => {
    expect(css).toMatch(
      /\.receipt-list--selectable \.receipt-list-header[\s\S]*grid-template-columns:\s*44px 88px minmax\(0, 1fr\) 104px 184px/,
    );
  });

  it("収入一覧は独立したメモ列の幅をスマートフォン幅の外でだけ維持する", () => {
    expect(css).toMatch(
      /@media \(min-width: 900px\)\s*\{\s*\.receipt-list--income \.receipt-list-header--income,\s*\.receipt-list--income \.receipt-row\s*\{[^}]*88px minmax\(0, 1\.3fr\) 104px minmax\(0, 1fr\)\s*184px/,
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
      /\.receipt-list--with-year \.receipt-row[^{]*\{[^}]*104px minmax\(0, 1fr\) 104px 184px/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*104px minmax\(0, 1fr\) 104px;/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--selectable\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*44px 104px minmax\(0, 1fr\) 104px;/,
    );
    expect(pcCss).toMatch(
      /\.receipt-list--with-year\.receipt-list--income\.receipt-list--no-actions \.receipt-row[^{]*\{[^}]*104px minmax\(0, 1\.3fr\) 104px minmax\(0, 1fr\);/,
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

  it("900〜1199pxでは操作列を詰めてアイコンのみにし、固定列と間隔が一覧の最小内幅に収まる", () => {
    // 一覧のgrid領域の最小幅: 900px（PC最小viewport）− サイドバー220px − 本文左右余白32px
    // − カードの枠線2pxと内側padding40px − 行の左右padding16px = 590px
    const minGridAreaPx = 900 - 220 - 32 - 42 - 16;
    const bandRules = cssRules(mediaBlockBodies(css, `${NARROW_PC_QUERY} {`).join("\n")).filter(
      (rule) =>
        rule.selector.includes("receipt") && rule.declarations.includes("grid-template-columns"),
    );

    // 操作列を持つ全バリアント（通常・選択・年つき・収入）に帯の列指定がある
    expect(bandRules).toHaveLength(6);
    for (const rule of bandRules) {
      const { fixedPx, gapPx } = fixedTracksPx(rule.declarations);
      expect(fixedPx + gapPx, rule.selector).toBeLessThanOrEqual(minGridAreaPx);
      // 最後の列（操作列）は124px以下に詰め、いちばん狭いバリアントでも店名列に約150pxを残す
      const lastTrack = rule.declarations
        .match(/grid-template-columns:\s*([^;]+);/)?.[1]
        .trim()
        .split(/\s+/)
        .at(-1);
      expect(Number.parseFloat(lastTrack ?? ""), rule.selector).toBeLessThanOrEqual(124);
    }

    // 操作列を持たないバリアントはPC用の列指定がそのまま効くため、そちらも最小内幅に収まることを確かめる
    const noActionRules = cssRules(pcCss).filter(
      (rule) =>
        rule.selector.includes("no-actions") && rule.declarations.includes("grid-template-columns"),
    );
    expect(noActionRules.length).toBeGreaterThan(0);
    for (const rule of noActionRules) {
      const { fixedPx, gapPx } = fixedTracksPx(rule.declarations);
      expect(fixedPx + gapPx, rule.selector).toBeLessThanOrEqual(minGridAreaPx);
    }
  });

  it("900〜1199pxでは操作ボタンの文言を隠し、アイコンと読み上げ名を残す", () => {
    const bandCss = mediaBlockBodies(css, `${NARROW_PC_QUERY} {`).join("\n");
    expect(bandCss).toMatch(/\.receipt-row-action-label\s*\{[^}]*display:\s*none/);
    expect(bandCss).toMatch(/\.receipt-row-actions \.MuiButton-root\s*\{[^}]*min-width:\s*0/);
    // 1200px以上とスマートフォンでは文言を消さない（帯のメディアクエリの外に書かない）
    expect(topLevelCss).not.toMatch(/\.receipt-row-action-label\s*\{[^}]*display:\s*none/);
    expect(mobile).not.toMatch(/receipt-row-action-label/);
  });
});
