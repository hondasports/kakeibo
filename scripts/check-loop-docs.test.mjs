import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkBannedVocabulary,
  checkLoopDocs,
  checkPathReferences,
  checkSectionNumbering,
  extractSkillReferences,
  parseFrontmatter,
} from "./check-loop-docs.mjs";

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
    ]) {
      expect(checkBannedVocabulary("docs/x.md", `これは ${word} です`)).toHaveLength(1);
    }
  });

  it("passes on current vocabulary", () => {
    expect(checkBannedVocabulary("docs/x.md", "要求工程と受入条件とHuman Gate")).toHaveLength(0);
  });
});

describe("repository loop docs", () => {
  it("the checked-in docs pass all checks", () => {
    const result = checkLoopDocs(REPO_ROOT);
    expect(result.errors).toEqual([]);
  });
});
