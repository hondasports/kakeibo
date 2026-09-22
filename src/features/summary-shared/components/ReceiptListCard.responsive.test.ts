import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReceiptListCard responsive styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

  it("PC一覧では日付と金額を詰めて店名・内訳の幅を広げる", () => {
    expect(css).toMatch(/grid-template-columns:\s*88px minmax\(200px, 1\.4fr\) 104px/);
  });

  it("選択可能な週次一覧だけチェックボックス列を足す", () => {
    expect(css).toMatch(
      /\.receipt-list--selectable \.receipt-list-header[\s\S]*grid-template-columns:\s*44px 88px minmax\(200px, 1\.4fr\) 104px/,
    );
  });

  it("長い店名でもグリッド列からはみ出さない", () => {
    expect(css).toMatch(/\.receipt-row-name\s*\{[^}]*min-width:\s*0/);
  });
});
