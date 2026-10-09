/* playwright JSON report (e2e-results/results.json) から flaky(passed-on-retry)
 * テストを抽出する。report-flaky-e2e.mjs がGitHub Step Summaryへの出力に使う。
 */

/** playwright JSON report → flaky(passed-on-retry)の {file,title} 一覧 */
export function flakyFromJsonReport(report) {
  const out = [];
  const walk = (suites = []) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (
          spec.ok === false &&
          spec.tests?.every((t) => t.status === "expected" || t.status === "skipped")
        )
          continue;
        for (const test of spec.tests ?? []) {
          if (test.status !== "flaky") continue;
          out.push({ file: spec.file ?? test.location?.file ?? "", title: spec.title ?? "" });
        }
      }
      walk(suite.suites ?? []);
    }
  };
  walk(report?.suites ?? []);
  return out;
}
