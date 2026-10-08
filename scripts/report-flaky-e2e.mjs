/* #958: playwright JSON report (e2e-results/results.json) から
 * flaky(passed-on-retry)テストを抽出し、GitHub Step Summary向けの
 * Markdownをstdoutへ出す。レポート不在/破損時はその旨だけ出してexit 0
 * （summary出力は観測でありゲートではない）。
 */
import { existsSync, readFileSync } from "node:fs";
import { flakyFromJsonReport } from "./ci-failure.mjs";

const REPORT = "e2e-results/results.json";

if (!existsSync(REPORT)) {
  console.log("### E2E flaky report\n\n`e2e-results/results.json` なし（E2E未実行または生成失敗）");
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(REPORT, "utf8"));
} catch (error) {
  console.log(`### E2E flaky report\n\nレポート解析失敗: ${error.message}`);
  process.exit(0);
}

const flaky = flakyFromJsonReport(report);
if (!flaky.length) {
  console.log("### E2E flaky report\n\nflaky なし（全テスト初回通過またはリトライでも失敗）");
  process.exit(0);
}

console.log(`### E2E flaky report — ${flaky.length} 件のpassed-on-retry\n`);
console.log("| file | title |");
console.log("|---|---|");
for (const t of flaky) console.log(`| ${t.file} | ${t.title} |`);
console.log("\nflaky テストはfollow-up Issueを起票して追跡する（#958 AC7）。");
