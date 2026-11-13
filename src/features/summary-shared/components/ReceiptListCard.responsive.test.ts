import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReceiptListCard responsive styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

  it("PC一覧では日付と金額を詰めて店名・内訳の幅を広げる", () => {
    expect(css).toMatch(/grid-template-columns:\s*88px minmax\(200px, 1fr\) 104px 184px/);
  });

  it("選択可能な週次一覧だけチェックボックス列を足す", () => {
    expect(css).toMatch(
      /\.receipt-list--selectable \.receipt-list-header[\s\S]*grid-template-columns:\s*44px 88px minmax\(200px, 1fr\) 104px 184px/,
    );
  });

  it("収入一覧は独立したメモ列の幅を維持する", () => {
    expect(css).toMatch(
      /\.receipt-list--income \.receipt-list-header--income,\s*\.receipt-list--income \.receipt-row\s*\{[^}]*88px minmax\(156px, 1\.3fr\) 104px minmax\(140px, 1fr\)\s*184px/,
    );
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
    const desktop = css.slice(0, css.indexOf("@media (max-width: 760px)"));
    expect(desktop).not.toMatch(/\.receipt-row--detail\s*\{[^}]*padding(?:-left)?:/);
    expect(desktop).toMatch(/\.receipt-row--detail \.receipt-row-name\s*\{[^}]*padding-left:/);
  });

  it("スマートフォンでは支出の親行と明細行の日付・金額を上に揃える", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobile).toMatch(
      /\.receipt-list:not\(\.receipt-list--income\) \.receipt-row-date,\s*\.receipt-list:not\(\.receipt-list--income\) \.receipt-row-amount\s*\{[^}]*align-self:\s*start/,
    );
  });

  it("スマートフォンの支出はメモ段を設けず選択欄を上に揃える", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobile).toMatch(
      /\.receipt-list--selectable \.receipt-row-select\s*\{[^}]*align-self:\s*start/,
    );
    expect(mobile).toMatch(
      /\.receipt-list--selectable:not\(\.receipt-list--income\) \.receipt-row\s*\{[^}]*"select date name amount" "select actions actions actions"/,
    );
  });
});
