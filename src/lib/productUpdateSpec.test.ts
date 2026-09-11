import { describe, expect, test } from "vitest";
import {
  extractUpdateSpecYaml,
  parseProductUpdateSpec,
  readProductUpdateSpec,
} from "./productUpdateSpec";

const START = "<!-- suzumemo-update:start -->";
const END = "<!-- suzumemo-update:end -->";

function bodyWith(block: string): string {
  return `## 概要\n\n変更点\n\n## 更新履歴\n\n${START}\n${block}\n${END}\n`;
}

describe("extractUpdateSpecYaml", () => {
  test("extracts a single yaml block between the markers", () => {
    const body = bodyWith("```yaml\npublish: false\nreason: 内部変更\n```");
    const result = extractUpdateSpecYaml(body);
    expect(result).toEqual({ ok: true, yaml: "publish: false\nreason: 内部変更\n" });
  });

  test("fails when the markers are missing entirely", () => {
    const result = extractUpdateSpecYaml("## 概要\n\n変更のみ\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("更新履歴ブロックがありません");
    }
  });

  test.each([
    ["missing start marker", `text\n${END}\n\`\`\`yaml\npublish: false\n\`\`\``],
    ["missing end marker", `text\n${START}\n\`\`\`yaml\npublish: false\n\`\`\``],
  ])("fails on %s", (_name, body) => {
    const result = extractUpdateSpecYaml(body);
    expect(result.ok).toBe(false);
  });

  test("fails on duplicated markers", () => {
    const body = `${START}\n\`\`\`yaml\npublish: false\nreason: a\n\`\`\`\n${END}\n${START}\n\`\`\`yaml\npublish: false\nreason: b\n\`\`\`\n${END}`;
    const result = extractUpdateSpecYaml(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("1つだけ");
    }
  });

  test("fails when the end marker comes before the start marker", () => {
    const result = extractUpdateSpecYaml(`${END}\n${START}`);
    expect(result.ok).toBe(false);
  });

  test("fails when there is no code block inside the markers", () => {
    const result = extractUpdateSpecYaml(`${START}\npublish: false\n${END}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("yaml コードブロックがありません");
    }
  });

  test("fails on multiple code blocks inside the markers", () => {
    const body = `${START}\n\`\`\`yaml\npublish: false\n\`\`\`\n\`\`\`yaml\nreason: x\n\`\`\`\n${END}`;
    const result = extractUpdateSpecYaml(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("1つだけ");
    }
  });

  test("fails when the single code block is not yaml", () => {
    const body = bodyWith('```json\n{"publish": false}\n```');
    const result = extractUpdateSpecYaml(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("yaml");
    }
  });

  test("fails on extra text inside the markers outside the yaml block", () => {
    const body = `${START}\n説明メモ\n\`\`\`yaml\npublish: false\nreason: x\n\`\`\`\n${END}`;
    const result = extractUpdateSpecYaml(body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("以外を記述しない");
    }
  });

  test("allows HTML comments inside the markers", () => {
    const body = `${START}\n<!-- 掲載しない場合は publish: false -->\n\`\`\`yaml\npublish: false\nreason: x\n\`\`\`\n${END}`;
    const result = extractUpdateSpecYaml(body);
    expect(result).toEqual({ ok: true, yaml: "publish: false\nreason: x\n" });
  });
});

describe("parseProductUpdateSpec", () => {
  test("accepts publish:true with category and multiline description", () => {
    const result = parseProductUpdateSpec(
      "publish: true\ncategory: fix\ndescription: |\n  明細の重複を修正しました。\n",
    );
    expect(result).toEqual({
      ok: true,
      spec: { publish: true, category: "fix", description: "明細の重複を修正しました。" },
    });
  });

  test("accepts publish:false with reason", () => {
    const result = parseProductUpdateSpec("publish: false\nreason: |\n  内部ドキュメントのみ。\n");
    expect(result).toEqual({
      ok: true,
      spec: { publish: false, reason: "内部ドキュメントのみ。" },
    });
  });

  test("fails when publish is missing", () => {
    const result = parseProductUpdateSpec("category: fix\ndescription: x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("`publish` は必須");
    }
  });

  test("fails when publish is not a boolean", () => {
    for (const yaml of ["publish: yes", "publish: 'true'", "publish: 1"]) {
      const result = parseProductUpdateSpec(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join()).toContain("`publish`");
      }
    }
  });

  test("fails on yaml syntax errors", () => {
    const result = parseProductUpdateSpec("publish: true\ncategory: [unclosed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("YAML構文エラー");
    }
  });

  test("fails when yaml is not a mapping", () => {
    const result = parseProductUpdateSpec("- publish\n- true");
    expect(result.ok).toBe(false);
  });

  test("fails on duplicate keys", () => {
    const result = parseProductUpdateSpec("publish: false\nreason: a\nreason: b");
    expect(result.ok).toBe(false);
  });

  test("fails on unknown keys", () => {
    const result = parseProductUpdateSpec("publish: false\nreason: a\ntitle: hello");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("`title`");
    }
  });

  test("publish:true requires category", () => {
    const result = parseProductUpdateSpec("publish: true\ndescription: 説明");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("`category`");
    }
  });

  test("publish:true rejects unknown category", () => {
    const result = parseProductUpdateSpec("publish: true\ncategory: breaking\ndescription: 説明");
    expect(result.ok).toBe(false);
  });

  test.each([["feature"], ["improvement"], ["fix"], ["performance"], ["stability"]])(
    "publish:true accepts category %s",
    (category) => {
      const result = parseProductUpdateSpec(
        `publish: true\ncategory: ${category}\ndescription: 説明`,
      );
      expect(result.ok).toBe(true);
    },
  );

  test("publish:true requires non-empty description", () => {
    for (const yaml of [
      "publish: true\ncategory: fix",
      "publish: true\ncategory: fix\ndescription:",
      "publish: true\ncategory: fix\ndescription: '   '",
      "publish: true\ncategory: fix\ndescription: 123",
    ]) {
      const result = parseProductUpdateSpec(yaml);
      expect(result.ok).toBe(false);
    }
  });

  test("publish:true rejects a reason field", () => {
    const result = parseProductUpdateSpec(
      "publish: true\ncategory: fix\ndescription: 説明\nreason: 理由",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("`reason` は記入できません");
    }
  });

  test("publish:false requires non-empty reason", () => {
    for (const yaml of [
      "publish: false",
      "publish: false\nreason:",
      "publish: false\nreason: ''",
    ]) {
      const result = parseProductUpdateSpec(yaml);
      expect(result.ok).toBe(false);
    }
  });

  test("publish:false rejects category and description", () => {
    const result = parseProductUpdateSpec("publish: false\nreason: 内部変更\ncategory: fix");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("`category` は記入できません");
    }
  });

  test("rejects placeholder values", () => {
    for (const yaml of [
      "publish: false\nreason: TODO: 後で書く",
      "publish: true\ncategory: fix\ndescription: <ここに説明>",
    ]) {
      const result = parseProductUpdateSpec(yaml);
      expect(result.ok).toBe(false);
    }
  });
});

describe("readProductUpdateSpec", () => {
  test("returns the spec from a full pull request body", () => {
    const body = bodyWith(
      "```yaml\npublish: true\ncategory: improvement\ndescription: |\n  軽くなりました。\n```",
    );
    const result = readProductUpdateSpec(body);
    expect(result).toEqual({
      ok: true,
      spec: { publish: true, category: "improvement", description: "軽くなりました。" },
    });
  });

  test("marker errors take precedence over yaml validation", () => {
    const result = readProductUpdateSpec("no markers");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join()).toContain("更新履歴ブロックがありません");
    }
  });
});
