import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { machineRiskForChange, machineRiskForPaths, readChangedHunks } from "./machine-risk.mjs";

describe("machineRiskForPaths", () => {
  it("forces T3 for schema changes", () => {
    expect(machineRiskForPaths(["convex/schema.ts"])).toMatchObject({
      minimumTier: "T3",
      floorTriggers: ["schema_or_migration"],
    });
  });

  it("keeps ordinary local changes at T1 machine floor", () => {
    expect(machineRiskForPaths(["src/features/foo/Foo.tsx"]).minimumTier).toBe("T1");
  });
});

describe("machineRiskForChange (content rules)", () => {
  it("AC1: fires authentication_or_authorization via content in a plain-named convex file", () => {
    const result = machineRiskForChange({
      paths: ["convex/categories/mutations.ts"],
      hunks: {
        "convex/categories/mutations.ts": ["const identity = await ctx.auth.getUserIdentity();"],
      },
    });
    expect(result.minimumTier).toBe("T3");
    expect(result.floorTriggers).toContain("authentication_or_authorization");
    expect(result.floorTriggerDetails).toContainEqual({
      trigger: "authentication_or_authorization",
      source: "content",
      path: "convex/categories/mutations.ts",
    });
  });

  it("positive: group membership assertion in src/**", () => {
    const result = machineRiskForChange({
      paths: ["src/features/settings/Panel.tsx"],
      hunks: {
        "src/features/settings/Panel.tsx": ["if (!assertGroupMember(user)) return null;"],
      },
    });
    expect(result.floorTriggers).toContain("authentication_or_authorization");
  });

  it("positive: ctx.db.delete fires data_deletion_or_retention", () => {
    const result = machineRiskForChange({
      paths: ["convex/cleanup/tasks.ts"],
      hunks: { "convex/cleanup/tasks.ts": ["await ctx.db.delete(id);"] },
    });
    expect(result.floorTriggers).toContain("data_deletion_or_retention");
  });

  it("positive: bare .delete( only fires under convex/", () => {
    const convex = machineRiskForChange({
      paths: ["convex/items/helpers.ts"],
      hunks: { "convex/items/helpers.ts": ["map.delete(key);"] },
    });
    const src = machineRiskForChange({
      paths: ["src/lib/map.ts"],
      hunks: { "src/lib/map.ts": ["map.delete(key);"] },
    });
    expect(convex.floorTriggers).toContain("data_deletion_or_retention");
    expect(src.minimumTier).toBe("T1");
  });

  it("positive: scheduler.runAfter + delete in the same hunk set", () => {
    const result = machineRiskForChange({
      paths: ["convex/jobs/worker.ts"],
      hunks: {
        "convex/jobs/worker.ts": [
          "await ctx.scheduler.runAfter(0, internal.jobs.remove, { id });",
          "// delete the job row",
        ],
      },
    });
    expect(result.floorTriggers).toContain("data_deletion_or_retention");
  });

  it("positive: defineTable fires schema_or_migration outside schema.ts", () => {
    const result = machineRiskForChange({
      paths: ["convex/tables/extra.ts"],
      hunks: { "convex/tables/extra.ts": ["export default defineTable({ name: v.string() });"] },
    });
    expect(result.floorTriggers).toContain("schema_or_migration");
  });

  it("positive: fetch( fires external_service_write_or_webhook under convex/ only", () => {
    const convex = machineRiskForChange({
      paths: ["convex/notify/send.ts"],
      hunks: { "convex/notify/send.ts": ["const res = await fetch(url);"] },
    });
    const src = machineRiskForChange({
      paths: ["src/lib/api.ts"],
      hunks: { "src/lib/api.ts": ["const res = await fetch(url);"] },
    });
    expect(convex.floorTriggers).toContain("external_service_write_or_webhook");
    expect(src.minimumTier).toBe("T1");
  });

  it("AC2: comment or string-literal edits still fire (over-detection accepted)", () => {
    const result = machineRiskForChange({
      paths: ["convex/categories/queries.ts"],
      hunks: {
        "convex/categories/queries.ts": [
          "// groupMembers は別テーブル",
          'const s = "ctx.db.delete"',
        ],
      },
    });
    expect(result.minimumTier).toBe("T3");
    expect(result.floorTriggers).toEqual(
      expect.arrayContaining(["authentication_or_authorization", "data_deletion_or_retention"]),
    );
  });

  it("AC3: test files never fire content rules", () => {
    const result = machineRiskForChange({
      paths: ["convex/categories/mutations.test.ts", "src/lib/foo.spec.ts"],
      hunks: {
        "convex/categories/mutations.test.ts": ["ctx.auth.getUserIdentity()", "ctx.db.delete(id)"],
        "src/lib/foo.spec.ts": ["fetch('http://x')"],
      },
    });
    expect(result.minimumTier).toBe("T1");
    expect(result.floorTriggerDetails.filter((d) => d.source === "content")).toHaveLength(0);
  });

  it("negative: unrelated edits in convex/src stay T1", () => {
    const result = machineRiskForChange({
      paths: ["convex/categories/mutations.ts", "src/features/foo/Foo.tsx"],
      hunks: {
        "convex/categories/mutations.ts": ["const label = rename(category);"],
        "src/features/foo/Foo.tsx": ["<Button onClick={save}>保存</Button>"],
      },
    });
    expect(result.minimumTier).toBe("T1");
  });

  it("negative: no hunks for a path means no content match", () => {
    const result = machineRiskForChange({
      paths: ["convex/categories/mutations.ts"],
      hunks: {},
    });
    expect(result.minimumTier).toBe("T1");
  });

  it("negative: non-target paths (.mjs scripts, docs) ignore content rules", () => {
    const result = machineRiskForChange({
      paths: ["scripts/foo.mjs", "docs/guide.md"],
      hunks: {
        "scripts/foo.mjs": ["getUserIdentity()", "fetch(x)"],
        "docs/guide.md": ["ctx.db.delete"],
      },
    });
    expect(result.minimumTier).toBe("T1");
  });

  it("negative: role checks that are not owner/member stay quiet", () => {
    const result = machineRiskForChange({
      paths: ["src/features/roles-panel.ts"],
      hunks: { "src/features/roles-panel.ts": ['if (role === "viewer") show();'] },
    });
    expect(result.minimumTier).toBe("T1");
  });

  it("negative: path-rule hit without matching content keeps source=path only", () => {
    const result = machineRiskForChange({
      paths: ["convex/schema.ts"],
      hunks: { "convex/schema.ts": ["const x = 1;"] },
    });
    expect(result.floorTriggers).toEqual(["schema_or_migration"]);
    expect(result.floorTriggerDetails).toEqual([
      { trigger: "schema_or_migration", source: "path", path: "convex/schema.ts" },
    ]);
  });

  it("AC5: unreadable diff fails closed to T3", () => {
    const result = machineRiskForChange({
      paths: ["src/features/foo/Foo.tsx"],
      diffFailed: true,
    });
    expect(result.minimumTier).toBe("T3");
    expect(result.floorTriggers).toContain("diff_read_failed");
    expect(result.floorTriggerDetails).toContainEqual({
      trigger: "diff_read_failed",
      source: "content",
      path: null,
    });
  });

  it("machineRiskForPaths stays a paths-only wrapper", () => {
    expect(machineRiskForPaths(["convex/schema.ts"])).toEqual(
      machineRiskForChange({ paths: ["convex/schema.ts"] }),
    );
  });
});

describe("readChangedHunks (diff parser)", () => {
  function repoWith(lines) {
    const dir = mkdtempSync(path.join(tmpdir(), "machine-risk-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    mkdirSync(path.join(dir, "convex"), { recursive: true });
    const file = path.join(dir, "convex", "helpers.ts");
    writeFileSync(file, lines.join("\n"));
    git("add", "-A");
    git("commit", "-m", "init");
    return { dir, git, file };
  }

  it("deleted files still contribute their removed lines (f-1)", () => {
    const { dir, git } = repoWith([
      "export async function sweep(ctx) {",
      "  await ctx.db.delete(row);",
      "}",
    ]);
    git("rm", "convex/helpers.ts");
    const hunks = readChangedHunks({ base: "HEAD", cwd: dir });
    expect(hunks["convex/helpers.ts"].join("\n")).toContain("ctx.db.delete");
    expect(machineRiskForChange({ paths: ["convex/helpers.ts"], hunks }).minimumTier).toBe("T3");
  });

  it("removed lines starting with '-- ' are hunk content, not file headers (f-2)", () => {
    const { dir, file } = repoWith([
      "const notes = [",
      "-- keep this comment",
      "  await ctx.db.delete(row);",
      "];",
    ]);
    writeFileSync(file, ["const notes = [", "  'safe line',", "];"].join("\n"));
    const hunks = readChangedHunks({ base: "HEAD", cwd: dir });
    expect(hunks["convex/helpers.ts"].join("\n")).toContain("ctx.db.delete");
    expect(machineRiskForChange({ paths: ["convex/helpers.ts"], hunks }).minimumTier).toBe("T3");
  });
});
