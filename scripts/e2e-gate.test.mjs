import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateE2EGate, renderGateSummary } from "./e2e-gate.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "e2e-gate.mjs");

describe("evaluateE2EGate", () => {
  it("classifyが成功し、e2eがsuccessまたはskippedなら成功する", () => {
    expect(
      evaluateE2EGate({
        classifyResult: "success",
        e2eResult: "success",
        jobs: [{ name: "E2E (Playwright / Chromium / public)", conclusion: "success" }],
      }).passed,
    ).toBe(true);
    expect(evaluateE2EGate({ classifyResult: "success", e2eResult: "skipped" }).passed).toBe(true);
  });

  it("e2eがfailure・cancelledなら失敗する", () => {
    for (const e2eResult of ["failure", "cancelled"]) {
      const result = evaluateE2EGate({ classifyResult: "success", e2eResult });
      expect(result.passed, e2eResult).toBe(false);
      expect(result.reason).toContain(e2eResult);
    }
  });

  it("classifyが成功以外なら、e2eがskippedでも失敗する", () => {
    for (const classifyResult of ["failure", "cancelled", "skipped"]) {
      const result = evaluateE2EGate({ classifyResult, e2eResult: "skipped" });
      expect(result.passed, classifyResult).toBe(false);
      expect(result.reason).toContain("classify");
    }
  });

  it("未知・欠落した結果は失敗に倒す", () => {
    expect(evaluateE2EGate({ classifyResult: "success", e2eResult: "" }).passed).toBe(false);
    expect(evaluateE2EGate({ classifyResult: undefined, e2eResult: "success" }).passed).toBe(false);
  });

  it("summaryに結果と理由を含める", () => {
    const summary = renderGateSummary(
      { classifyResult: "success", e2eResult: "failure" },
      evaluateE2EGate({ classifyResult: "success", e2eResult: "failure" }),
    );
    expect(summary).toContain("E2E gate");
    expect(summary).toContain("failure");
  });
});

describe("evaluateE2EGate with matrix jobs", () => {
  const job = (name, conclusion) => ({ name: `E2E (Playwright / Chromium / ${name})`, conclusion });
  const evaluate = (e2eResult, jobs) =>
    evaluateE2EGate({ classifyResult: "success", e2eResult, jobs });

  it("e2eがsuccessでも、jobsにfailureがあれば失敗する（片方の再実行対策）", () => {
    const result = evaluate("success", [job("public", "success"), job("authenticated", "failure")]);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("authenticated");
  });

  it("対象jobがすべてsuccessなら成功する", () => {
    expect(
      evaluate("success", [job("public", "success"), job("authenticated", "success")]).passed,
    ).toBe(true);
  });

  it("cancelledを含めば失敗する", () => {
    expect(
      evaluate("success", [job("public", "success"), job("authenticated", "cancelled")]).passed,
    ).toBe(false);
  });

  it("対象jobが0件、またはjobs未取得は失敗する（fail closed）", () => {
    expect(evaluate("success", []).passed).toBe(false);
    expect(
      evaluate("success", [{ name: "Classify E2E relevance", conclusion: "success" }]).passed,
    ).toBe(false);
    expect(evaluate("success", undefined).passed).toBe(false);
  });

  it("skippedはjobsに関係なく成功する", () => {
    expect(evaluate("skipped", []).passed).toBe(true);
    expect(evaluate("skipped", undefined).passed).toBe(true);
  });

  it("classifyが失敗ならjobsがsuccessでも失敗する", () => {
    expect(
      evaluateE2EGate({
        classifyResult: "failure",
        e2eResult: "success",
        jobs: [job("public", "success")],
      }).passed,
    ).toBe(false);
  });

  it("summaryにjobごとの名前とconclusionを出す", () => {
    const jobs = [job("public", "success"), job("authenticated", "failure")];
    const results = { classifyResult: "success", e2eResult: "success", jobs };
    const summary = renderGateSummary(results, evaluateE2EGate(results));
    expect(summary).toContain("E2E (Playwright / Chromium / authenticated)");
    expect(summary).toContain("failure");
  });
});

describe("e2e-gate CLI", () => {
  const run = (env, jobsContent) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "e2e-gate-"));
    const summaryPath = path.join(dir, "summary.md");
    try {
      const jobsPath = path.join(dir, "jobs.ndjson");
      if (jobsContent !== undefined) writeFileSync(jobsPath, jobsContent);
      let status = 0;
      try {
        execFileSync("node", [SCRIPT], {
          env: {
            PATH: process.env.PATH,
            ...env,
            E2E_JOBS_FILE: jobsPath,
            GITHUB_STEP_SUMMARY: summaryPath,
          },
          stdio: "pipe",
        });
      } catch (error) {
        status = error.status;
      }
      let summary = "";
      try {
        summary = readFileSync(summaryPath, "utf8");
      } catch {
        // summaryが書かれない場合は空のまま
      }
      return { status, summary };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("成功時は終了コード0でsummaryを書く", () => {
    const { status, summary } = run({ CLASSIFY_RESULT: "success", E2E_RESULT: "skipped" });
    expect(status).toBe(0);
    expect(summary).toContain("skipped");
  });

  const ndjson = (...rows) => rows.map((row) => JSON.stringify(row)).join("\n");

  it("e2eがsuccessでjobsがすべてsuccessなら終了コード0", () => {
    const jobs = ndjson(
      { name: "E2E (Playwright / Chromium / public)", conclusion: "success" },
      { name: "E2E (Playwright / Chromium / authenticated)", conclusion: "success" },
    );
    expect(run({ CLASSIFY_RESULT: "success", E2E_RESULT: "success" }, jobs).status).toBe(0);
  });

  it("e2eがsuccessでもjobsにfailureがあれば終了コード1", () => {
    const jobs = ndjson(
      { name: "E2E (Playwright / Chromium / public)", conclusion: "success" },
      { name: "E2E (Playwright / Chromium / authenticated)", conclusion: "failure" },
    );
    expect(run({ CLASSIFY_RESULT: "success", E2E_RESULT: "success" }, jobs).status).toBe(1);
  });

  it("jobs一覧を読めない・壊れているときは（skipped以外）終了コード1", () => {
    expect(run({ CLASSIFY_RESULT: "success", E2E_RESULT: "success" }).status).toBe(1);
    expect(run({ CLASSIFY_RESULT: "success", E2E_RESULT: "success" }, "{not json").status).toBe(1);
  });

  it("失敗時は終了コード1でsummaryを書く", () => {
    const { status, summary } = run({ CLASSIFY_RESULT: "success", E2E_RESULT: "cancelled" });
    expect(status).toBe(1);
    expect(summary).toContain("cancelled");
  });
});

describe("E2E workflow gate contract", () => {
  const workflow = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.github/workflows/e2e.yml"),
    "utf8",
  );

  it("E2E gate jobはclassifyとe2eをneedsし、常に評価される", () => {
    expect(workflow).toContain("name: E2E gate");
    expect(workflow).toContain("needs: [classify, e2e]");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("needs.classify.result");
    expect(workflow).toContain("needs.e2e.result");
  });

  it("jobs一覧を最新attemptで取得するため actions: read を付ける", () => {
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("filter=latest");
    expect(workflow).toContain("E2E_JOBS_FILE");
  });

  it("failure・cancelledのどちらでもartifactを保存し、globalTimeoutをmatrixから渡す", () => {
    expect(workflow).toContain("if: failure() || cancelled()");
    expect(workflow).toContain("E2E_GLOBAL_TIMEOUT_MS: ${{ matrix.global_timeout_ms }}");
  });
});
