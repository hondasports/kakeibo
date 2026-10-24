import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SKILLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SKILLS_DIR);

// skills/skills.test.mjs のような skills/ 直下のファイルは、skill への参照として数えない。
const SKILL_REFERENCE = /(?<![\w./-])skills\/([a-z0-9-]+)(?![\w.-])/g;

const skillNames = () =>
  readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const frontmatter = (name) => {
  const text = readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8");
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  const field = (key) => new RegExp(`^${key}:\\s*(.*)$`, "m").exec(block)?.[1]?.trim() ?? "";
  return { name: field("name"), description: field("description") };
};

const capabilitySkillsSection = () => {
  const agents = readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");
  const start = agents.indexOf("## Capability skills");
  const end = agents.indexOf("\n## ", start + 1);
  return agents.slice(start, end === -1 ? undefined : end);
};

const referencedSkills = (text) => [...text.matchAll(SKILL_REFERENCE)].map((match) => match[1]);

describe("repository skills", () => {
  test("every skill has a SKILL.md whose frontmatter name matches its directory and has a description", () => {
    for (const name of skillNames()) {
      expect(existsSync(path.join(SKILLS_DIR, name, "SKILL.md")), name).toBe(true);
      const meta = frontmatter(name);
      expect(meta.name, name).toBe(name);
      expect(meta.description, name).not.toBe("");
    }
  });

  test("the AGENTS.md Capability skills table routes to every skill and only to existing skills", () => {
    const routed = new Set(referencedSkills(capabilitySkillsSection()));

    expect([...routed].sort()).toEqual(skillNames());
  });

  test("every skills/<name> reference in tracked docs points to an existing skill", () => {
    const known = new Set(skillNames());
    const files = execFileSync("git", ["ls-files", "*.md", "*.yaml", "*.yml"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    const broken = files.flatMap((file) =>
      referencedSkills(readFileSync(path.join(REPO_ROOT, file), "utf8"))
        .filter((name) => !known.has(name))
        .map((name) => `${file}: skills/${name}`),
    );

    expect(broken).toEqual([]);
  });
});
