import { describe, expect, test } from "vitest";
import { evaluatePullRequestSpec } from "./check-pr-product-update";

const START = "<!-- suzumemo-update:start -->";
const END = "<!-- suzumemo-update:end -->";

function specBody(yaml: string): string {
  return `## 概要\n\n本文\n\n## 更新履歴\n\n${START}\n\`\`\`yaml\n${yaml}\`\`\`\n${END}\n`;
}

function payload(
  overrides: {
    body?: string | null;
    baseRef?: string;
    userType?: string;
  } = {},
) {
  return {
    pull_request: {
      number: 1,
      title: "fix: 明細の重複",
      body: overrides.body ?? specBody("publish: false\nreason: 内部変更\n"),
      base: { ref: overrides.baseRef ?? "preview" },
      user: { type: overrides.userType ?? "User", login: "dev" },
    },
  };
}

describe("evaluatePullRequestSpec", () => {
  test("passes a valid publish:false spec", () => {
    const decision = evaluatePullRequestSpec(payload());
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(true);
    }
  });

  test("passes a valid publish:true spec", () => {
    const decision = evaluatePullRequestSpec(
      payload({ body: specBody("publish: true\ncategory: fix\ndescription: 修正しました\n") }),
    );
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(true);
      expect(decision.summary).toContain("掲載");
    }
  });

  test("fails when the spec block is missing", () => {
    const decision = evaluatePullRequestSpec(payload({ body: "## 概要\n\n本文のみ" }));
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(false);
      expect(decision.summary).toContain("更新履歴欄に問題があります");
    }
  });

  test("fails on an invalid spec", () => {
    const decision = evaluatePullRequestSpec(
      payload({ body: specBody("publish: true\ncategory: fix\n") }),
    );
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(false);
    }
  });

  test("skips non-preview base branches", () => {
    const decision = evaluatePullRequestSpec(payload({ baseRef: "main", body: "no spec" }));
    expect(decision.kind).toBe("skipped");
    expect(decision.summary).toContain("対象外");
  });

  test("skips bot-authored pull requests without a spec marker", () => {
    const decision = evaluatePullRequestSpec(payload({ userType: "Bot", body: "no spec" }));
    expect(decision.kind).toBe("skipped");
    expect(decision.summary).toContain("bot");
  });

  test("validates bot-authored pull requests that carry a spec block", () => {
    const decision = evaluatePullRequestSpec(payload({ userType: "Bot" }));
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(true);
      expect(decision.summary).toContain("非掲載");
    }
  });

  test("fails bot-authored pull requests with an invalid spec", () => {
    const decision = evaluatePullRequestSpec(
      payload({ userType: "Bot", body: specBody("publish: true\ncategory: fix\n") }),
    );
    expect(decision.kind).toBe("validated");
    if (decision.kind === "validated") {
      expect(decision.result.ok).toBe(false);
    }
  });
});
