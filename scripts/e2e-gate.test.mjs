import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateE2EGate, renderGateSummary } from "./e2e-gate.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "e2e-gate.mjs");

describe("evaluateE2EGate", () => {
  it("classifyが成功し、e2eがsuccessまたはskippedなら成功する", () => {
    expect(evaluateE2EGate({ classifyResult: "success", e2eResult: "success" }).passed).toBe(true);
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

describe("e2e-gate CLI", () => {
  const run = (env) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "e2e-gate-"));
    const summaryPath = path.join(dir, "summary.md");
    try {
      let status = 0;
      try {
        execFileSync("node", [SCRIPT], {
          env: { PATH: process.env.PATH, ...env, GITHUB_STEP_SUMMARY: summaryPath },
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

  it("failure・cancelledのどちらでもartifactを保存し、globalTimeoutをmatrixから渡す", () => {
    expect(workflow).toContain("if: failure() || cancelled()");
    expect(workflow).toContain("E2E_GLOBAL_TIMEOUT_MS: ${{ matrix.global_timeout_ms }}");
  });
});
