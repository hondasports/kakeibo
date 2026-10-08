import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkBannedVocabulary,
  checkCommandReferences,
  checkLimitKeyMentions,
  checkLoopDocs,
  checkPathReferences,
  checkSectionNumbering,
  extractSkillReferences,
  limitKeyPattern,
  parseFrontmatter,
} from "./check-loop-docs.mjs";
import { checkHarnessStatesDoc, generateHarnessStatesDoc } from "./generate-harness-docs.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDirs = [];

function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "loop-docs-"));
  tempDirs.push(dir);
  return dir;
}

function write(dir, relativePath, content) {
  const absolutePath = path.join(dir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("parseFrontmatter", () => {
  it("parses yaml-like frontmatter keys", () => {
    const frontmatter = parseFrontmatter(
      "---\nname: x\ndescription: y\nlicense: Apache-2.0\n---\nbody",
    );
    expect(frontmatter).toEqual({ name: "x", description: "y", license: "Apache-2.0" });
  });

  it("returns null when frontmatter is absent", () => {
    expect(parseFrontmatter("# no frontmatter")).toBeNull();
  });
});

describe("skill reference checks", () => {
  it("extracts unique skill names", () => {
    expect(extractSkillReferences("a skills/foo b skills/foo c skills/bar-x")).toEqual([
      "foo",
      "bar-x",
    ]);
  });

  it("fails when AGENTS.md references a missing skill", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "see `skills/missing-skill`");
    write(repo, "docs/development-process.md", "# doc");
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("missing-skill"))).toBe(true);
  });

  it("fails when a SKILL.md misses a required frontmatter key", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "no skills referenced");
    write(repo, "skills/demo/SKILL.md", "---\nname: demo\ndescription: d\n---\nbody");
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("license"))).toBe(true);
  });

  it("fails when frontmatter name does not match the directory", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "x");
    write(repo, "skills/demo/SKILL.md", "---\nname: other\ndescription: d\nlicense: l\n---\nbody");
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("name(other)"))).toBe(true);
  });

  it("fails when a SKILL.md exists but is not referenced from AGENTS.md", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "## Capability skills\n\n- see `skills/listed` only\n\n## Runtime\n");
    write(
      repo,
      "skills/listed/SKILL.md",
      "---\nname: listed\ndescription: d\nlicense: l\n---\nbody",
    );
    write(
      repo,
      "skills/orphan/SKILL.md",
      "---\nname: orphan\ndescription: d\nlicense: l\n---\nbody",
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("skills/orphan"))).toBe(true);
    expect(result.errors.some((e) => e.includes("skills/listed"))).toBe(false);
  });

  it("ignores skill mentions outside the Capability skills section", () => {
    const repo = makeRepo();
    write(
      repo,
      "AGENTS.md",
      "other text `skills/listed`\n\n## Capability skills\n\n- none\n\n## Runtime\n",
    );
    write(
      repo,
      "skills/listed/SKILL.md",
      "---\nname: listed\ndescription: d\nlicense: l\n---\nbody",
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("skills/listed"))).toBe(true);
  });

  it("fails on a skills/ directory without SKILL.md", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "## Capability skills\n\n- `skills/listed`\n\n## Runtime\n");
    write(
      repo,
      "skills/listed/SKILL.md",
      "---\nname: listed\ndescription: d\nlicense: l\n---\nbody",
    );
    write(repo, "skills/stray/notes.md", "leftover");
    write(
      repo,
      "skills/nested/deep/SKILL.md",
      "---\nname: deep\ndescription: d\nlicense: l\n---\nbody",
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("skills/stray"))).toBe(true);
    expect(result.errors.some((e) => e.includes("skills/nested"))).toBe(true);
    expect(result.errors.some((e) => e.includes("skills/listed"))).toBe(false);
  });
});

describe("path reference checks", () => {
  it("fails on a dead markdown link", () => {
    const errors = checkPathReferences("/repo", "docs/a.md", "[x](./missing.md)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing.md");
  });

  it("fails on a dead code-span path reference", () => {
    const errors = checkPathReferences("/repo", "docs/a.md", "参照先は `docs/superpowers/` です");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("docs/superpowers");
  });

  it("ignores non-path code spans and external links", () => {
    const errors = checkPathReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run build` と `pnpm` と [ext](https://example.com) と `git worktree add ../x/<b>`",
    );
    expect(errors).toHaveLength(0);
  });

  it("accepts section anchors on existing files in links and code spans", () => {
    const errors = checkPathReferences(
      REPO_ROOT,
      "docs/a.md",
      "[詳細](development-process.md#6-verification) と `docs/development-process.md#pr-ci-e2eの差分判定` と `#same-page`",
    );
    expect(errors).toHaveLength(0);
  });

  it("still fails on a dead path hidden behind an anchor", () => {
    const errors = checkPathReferences(
      REPO_ROOT,
      "docs/a.md",
      "[x](./missing.md#sec) `docs/missing.md#sec`",
    );
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.includes("missing.md"))).toBe(true);
  });
});

describe("command reference checks", () => {
  const scripts = new Set(["dev", "e2e:smoke", "test:unit"]);

  it("fails on a missing pnpm run script", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run missing-script` を実行する",
      scripts,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("pnpm run missing-script");
  });

  it("fails on a missing colon-form pnpm script", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "pnpm e2e:missing で確認する",
      scripts,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("pnpm e2e:missing");
  });

  it("ignores pnpm builtins and resolves existing scripts", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run dev` / `pnpm e2e:smoke` / pnpm exec playwright / pnpm install / pnpm test",
      scripts,
    );
    expect(errors).toHaveLength(0);
  });

  it("skips script validation when package.json is absent", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run anything` を実行する",
      null,
    );
    expect(errors).toHaveLength(0);
  });

  it("skips flags before the script name in pnpm run calls", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run --if-present e2e:smoke` と `pnpm run -r dev`",
      scripts,
    );
    expect(errors).toHaveLength(0);
  });

  it("still validates the script name after pnpm run flags", () => {
    const errors = checkCommandReferences(
      "/repo",
      "docs/a.md",
      "`pnpm run --if-present missing-script`",
      scripts,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing-script");
  });

  it("strips full-width punctuation after a script path", () => {
    const repo = makeRepo();
    write(repo, "package.json", JSON.stringify({ scripts: {} }));
    write(repo, "AGENTS.md", "x");
    write(repo, "scripts/real.mjs", "export {}");
    write(
      repo,
      "docs/guide.md",
      "（node scripts/real.mjs）で確認する。node scripts/gone.mjs。は失敗",
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("scripts/real.mjs"))).toBe(false);
    expect(result.errors.some((e) => e.includes("scripts/gone.mjs"))).toBe(true);
  });

  it("fails on a missing node/tsx script path", () => {
    const repo = makeRepo();
    write(repo, "package.json", JSON.stringify({ scripts: {} }));
    write(repo, "AGENTS.md", "x");
    write(repo, "scripts/real.mjs", "export {}");
    write(
      repo,
      "docs/guide.md",
      "node scripts/real.mjs は動くが、 node scripts/gone.mjs と tsx scripts/gone.ts は失敗する",
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("scripts/gone.mjs"))).toBe(true);
    expect(result.errors.some((e) => e.includes("scripts/gone.ts"))).toBe(true);
    expect(result.errors.some((e) => e.includes("scripts/real.mjs"))).toBe(false);
  });
});

describe("section numbering", () => {
  it("fails on gaps", () => {
    const errors = checkSectionNumbering("docs/x.md", "## 1. a\n## 3. b\n## 4. c");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("## 3.");
  });

  it("passes on consecutive numbering", () => {
    expect(
      checkSectionNumbering("docs/x.md", "## 1. a\n## 2. b\n### 9. nested ignored"),
    ).toHaveLength(0);
  });
});

describe("banned vocabulary", () => {
  it("detects removed-loop jargon", () => {
    for (const word of [
      "PREPARE",
      "Learning Event",
      "docs/superpowers/",
      "task/session binding",
      ".loop/state",
      "委譲用workflowは使用しません",
      ".agent/models/default.yaml",
      "--model unknown",
      "Model Registry",
      "recommended_profile",
    ]) {
      expect(checkBannedVocabulary("docs/x.md", `これは ${word} です`)).toHaveLength(1);
    }
  });

  it("passes on current vocabulary", () => {
    expect(checkBannedVocabulary("docs/x.md", "要求工程と受入条件とHuman Gate")).toHaveLength(0);
    expect(checkBannedVocabulary("docs/x.md", "coverageはbest-effortで計測する")).toHaveLength(0);
  });
});

describe("scan scope", () => {
  it("scans README for broken links and outdated process policies", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "no skills referenced");
    write(repo, "docs/development-process.md", "# doc");
    write(
      repo,
      "README.md",
      "[missing](docs/missing.md)\n通常は単独エージェントです。委譲用workflowは使用しません。",
    );

    const result = checkLoopDocs(repo);
    expect(result.docFiles).toContain("README.md");
    expect(
      result.errors.some((error) => error.includes("README.md") && error.includes("missing")),
    ).toBe(true);
    expect(result.errors.some((error) => error.includes("委譲用workflowは使用しません"))).toBe(
      true,
    );
  });

  it("ignores directories outside docs/skills even when they contain broken symlinks", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "no skills referenced");
    write(repo, "docs/development-process.md", "# doc");
    mkdirSync(path.join(repo, "node_modules"), { recursive: true });
    symlinkSync(path.join(repo, "no-such-target"), path.join(repo, "node_modules", "broken"));
    symlinkSync(repo, path.join(repo, "node_modules", "cycle"));

    const result = checkLoopDocs(repo);
    expect(result.errors).toEqual([]);
    expect(result.docFiles).toEqual(["AGENTS.md", "docs/development-process.md"]);
  });

  it("does not traverse symlinked directories inside docs", () => {
    const repo = makeRepo();
    write(repo, "AGENTS.md", "x");
    write(repo, "docs/development-process.md", "# doc");
    write(repo, "outside/hidden.md", "PREPARE banned word");
    symlinkSync(path.join(repo, "outside"), path.join(repo, "docs", "linked"));

    const result = checkLoopDocs(repo);
    expect(result.docFiles).not.toContain("docs/linked/hidden.md");
    expect(result.errors.some((e) => e.includes("PREPARE"))).toBe(false);
  });
});

describe("link anchor validation", () => {
  it("accepts a markdown link whose fragment matches a heading in the target", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "# T\n\n## 実装と検証\n\nbody\n");
    write(repo, "docs/source.md", "[x](target.md#実装と検証)");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#実装と検証)");
    expect(errors).toEqual([]);
  });

  it("rejects a markdown link whose fragment is missing in the target", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "# T\n\n## other section\n\nbody\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#実装と検証)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("セクション");
  });

  it("accepts duplicate headings via GitHub's -N suffix numbering", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "## repeat\n## repeat\n## repeat\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#repeat-2)");
    expect(errors).toEqual([]);
  });

  it("skips fragments on external URLs", () => {
    const repo = makeRepo();
    const errors = checkPathReferences(
      repo,
      "docs/source.md",
      "[x](https://example.com/doc#anything)",
    );
    expect(errors).toEqual([]);
  });

  it("resolves a bare #fragment against the same document", () => {
    const repo = makeRepo();
    const content = "# S\n\n## 実装と検証\n\n[x](#実装と検証)\n";
    write(repo, "docs/source.md", content);
    const errors = checkPathReferences(repo, "docs/source.md", content);
    expect(errors).toEqual([]);
  });

  it("reports (does not crash on) a bare #fragment missing in the same document", () => {
    const repo = makeRepo();
    const content = "# S\n\n[x](#missing)";
    write(repo, "docs/source.md", content);
    const errors = checkPathReferences(repo, "docs/source.md", content);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("セクション");
  });

  it("reports (does not crash on) an anchor on a directory target", () => {
    const repo = makeRepo();
    write(repo, ".agent/workflow/refine.md", "# refine\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](../.agent/#sec)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("セクション");
  });

  it("reports (does not crash on) malformed percent-encoding in a fragment", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "# T\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#100%)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("percent-encoding");
  });

  it("does not treat '# ' lines inside fenced code as headings", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "# T\n\n```bash\n# comment-like line\n```\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#comment-like-line)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("セクション");
  });

  it("matches fragments case-sensitively like GitHub", () => {
    const repo = makeRepo();
    write(repo, "docs/target.md", "## Section\n");
    const errors = checkPathReferences(repo, "docs/source.md", "[x](target.md#Section)");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("セクション");
  });
});

describe("limit key mentions", () => {
  it("rejects limit key names in handwritten docs", () => {
    const errors = checkLimitKeyMentions("docs/x.md", "上限は review_max_rounds を参照");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("agent-harness-states.md");
  });

  it("rejects every limit key", () => {
    for (const key of [
      "same_failure_max",
      "review_reassess_every",
      "review_max_rounds",
      "ci_fix_max_rounds",
    ]) {
      expect(checkLimitKeyMentions("docs/x.md", `値 ${key}`)).toHaveLength(1);
    }
  });

  it("allows the generated states doc to name the keys", () => {
    expect(checkLimitKeyMentions("docs/agent-harness-states.md", "review_max_rounds: 5")).toEqual(
      [],
    );
  });

  it("does not flag unrelated words", () => {
    expect(checkLimitKeyMentions("docs/x.md", "round数の上限")).toEqual([]);
  });

  it("derives the banned keys from process.yaml so new keys stay banned", () => {
    const repo = makeRepo();
    write(
      repo,
      ".agent/process.yaml",
      "initial: refine\nlimits:\n  same_failure_max: 3\n  brand_new_limit: 2\n",
    );
    const pattern = limitKeyPattern(repo);
    expect(checkLimitKeyMentions("docs/x.md", "値 brand_new_limit", pattern)).toHaveLength(1);
    expect(checkLimitKeyMentions("docs/x.md", "値 same_failure_max", pattern)).toHaveLength(1);
  });

  it("falls back to the known keys when process.yaml is absent", () => {
    const repo = makeRepo();
    const pattern = limitKeyPattern(repo);
    expect(checkLimitKeyMentions("docs/x.md", "値 review_max_rounds", pattern)).toHaveLength(1);
  });
});

describe("generated states doc drift", () => {
  const PROCESS_YAML = [
    "initial: refine",
    "limits:",
    "  same_failure_max: 3",
    "states:",
    "  refine:",
    "    workflow: .agent/workflow/refine.md",
    "    on:",
    "      ready: execute",
    "  execute:",
    "    workflow: .agent/workflow/execute.md",
    "    on:",
    "      ready: review",
    "  review:",
    "    terminal: false",
    "    on:",
    "      clean: done",
    "  done:",
    "    terminal: true",
    "",
  ].join("\n");

  function repoWithStatesDoc() {
    const repo = makeRepo();
    write(repo, ".agent/process.yaml", PROCESS_YAML);
    write(repo, "docs/agent-harness-states.md", generateHarnessStatesDoc(PROCESS_YAML));
    return repo;
  }

  it("returns null when the committed doc matches process.yaml", () => {
    expect(checkHarnessStatesDoc(repoWithStatesDoc())).toBeNull();
  });

  it("fails when process.yaml drifts from the committed doc", () => {
    const repo = repoWithStatesDoc();
    write(
      repo,
      ".agent/process.yaml",
      PROCESS_YAML.replace("same_failure_max: 3", "same_failure_max: 4"),
    );
    const error = checkHarnessStatesDoc(repo);
    expect(error).toContain("一致しません");
    expect(error).toContain("generate-harness-docs.mjs");
  });

  it("fails through checkLoopDocs when the generated doc is stale", () => {
    const repo = repoWithStatesDoc();
    write(repo, "AGENTS.md", "x");
    write(repo, "docs/development-process.md", "# doc");
    write(
      repo,
      ".agent/process.yaml",
      PROCESS_YAML.replace("same_failure_max: 3", "same_failure_max: 9"),
    );
    const result = checkLoopDocs(repo);
    expect(result.errors.some((e) => e.includes("agent-harness-states.md"))).toBe(true);
  });

  it("returns null when process.yaml is absent", () => {
    const repo = makeRepo();
    expect(checkHarnessStatesDoc(repo)).toBeNull();
  });
});

describe("repository loop docs", () => {
  it("the checked-in docs pass all checks", () => {
    const result = checkLoopDocs(REPO_ROOT);
    expect(result.errors).toEqual([]);
  });
});
