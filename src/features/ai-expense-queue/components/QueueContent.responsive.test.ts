import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ai-expense-queue responsive styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

  it("キューコンテナが横方向に内容を切り落とさない", () => {
    expect(css).not.toMatch(/\.ai-expense-queue\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.ai-expense-queue[\s\S]*max-width:\s*100%/);
  });

  it("ステータスサマリーが折り返せる", () => {
    expect(css).toContain(".ai-expense-queue-status-summary");
    expect(css).toMatch(/\.ai-expense-queue-status-summary[\s\S]*flex-wrap:\s*wrap/);
  });

  it("長いファイル名が折り返せる", () => {
    expect(css).toContain(".ai-expense-queue-item-secondary");
    expect(css).toMatch(/\.ai-expense-queue-item-secondary[\s\S]*overflow-wrap:\s*anywhere/);
  });

  it("入力ワークベンチは display: contents に依存しない", () => {
    expect(css).not.toMatch(/\.input-workbench[\s\S]*display:\s*contents/);
    expect(css).not.toMatch(
      /@media not all and \(min-width: 900px\)[\s\S]*\.input-workbench-queue[\s\S]*display:\s*contents/,
    );
  });

  it("PCでは2カラム grid-template-areas でフォームとキュー3ブロックを配置する", () => {
    expect(css).toMatch(
      /\.input-workbench\s*\{[^}]*grid-template-areas:\s*[^;]*"form queue-header"/,
    );
    expect(css).toMatch(/grid-template-areas:[^;]*"form queue-active"/);
    expect(css).toMatch(/grid-template-areas:[^;]*"form queue-registered"/);
    expect(css).toMatch(/\.input-workbench-form\s*\{[^}]*grid-area:\s*form/);
    expect(css).toMatch(/\.input-workbench-queue-header\s*\{[^}]*grid-area:\s*queue-header/);
    expect(css).toMatch(/\.input-workbench-queue-active\s*\{[^}]*grid-area:\s*queue-active/);
    expect(css).toMatch(
      /\.input-workbench-queue-registered\s*\{[^}]*grid-area:\s*queue-registered/,
    );
  });

  it("SPでは1カラム grid-template-areas でヘッダー→アクティブ→フォーム→登録済みの順に並べる", () => {
    expect(css).toMatch(
      /@media not all and \(min-width: 900px\)[\s\S]*grid-template-areas:\s*[^;]*"queue-header"[^;]*"queue-active"[^;]*"form"[^;]*"queue-registered"/,
    );
  });
});
