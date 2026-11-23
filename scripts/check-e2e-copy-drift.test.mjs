import { describe, expect, it } from "vitest";

import {
  extractCopyStrings,
  findCopyDrift,
  isTestSourcePath,
  parseRemovedSourceLines,
  REMAINING_COPY_PATHSPECS,
} from "./check-e2e-copy-drift.mjs";

describe("remaining copy search scope", () => {
  // 既定カテゴリ（lib/domain/categories/defaults.ts）等、画面の文言は lib・convex からも出る。
  // src だけを探すと、E2E用データから同じ語を外しただけで無関係なE2Eを誤検知する。
  it("searches src, lib and convex for copy that still exists, excluding test helpers", () => {
    expect(REMAINING_COPY_PATHSPECS.slice(0, 3)).toEqual(["src", "lib", "convex"]);
    expect(REMAINING_COPY_PATHSPECS).toContain(":(exclude,glob)**/*.test.*");
  });
});

const DIFF = [
  "diff --git a/src/pages/Group.tsx b/src/pages/Group.tsx",
  "--- a/src/pages/Group.tsx",
  "+++ b/src/pages/Group.tsx",
  "@@ -1,3 +1,3 @@",
  "-      <h1>家族グループを作成</h1>",
  "+      <h1>グループを作る</h1>",
  "diff --git a/src/pages/Group.test.tsx b/src/pages/Group.test.tsx",
  "--- a/src/pages/Group.test.tsx",
  "+++ b/src/pages/Group.test.tsx",
  "@@ -1,1 +1,1 @@",
  '-  expect(screen.getByText("テスト専用の文言")).toBeTruthy();',
  '+  expect(screen.getByText("新しい文言")).toBeTruthy();',
  "diff --git a/src/lib/a.ts b/src/lib/a.ts",
  "--- a/src/lib/a.ts",
  "+++ b/src/lib/a.ts",
  "@@ -5,1 +5,1 @@",
  "-const label = 'ラベルです';",
  "+const label = 'ラベル';",
].join("\n");

describe("parseRemovedSourceLines", () => {
  it("collects removed lines of non-test src files only", () => {
    const lines = parseRemovedSourceLines(DIFF);
    expect(lines).toEqual(["      <h1>家族グループを作成</h1>", "const label = 'ラベルです';"]);
  });

  it("ignores the --- file header", () => {
    expect(parseRemovedSourceLines(DIFF).some((line) => line.startsWith("-- "))).toBe(false);
  });
});

describe("isTestSourcePath", () => {
  it("detects test files", () => {
    expect(isTestSourcePath("src/a.test.tsx")).toBe(true);
    expect(isTestSourcePath("src/a.spec.ts")).toBe(true);
    expect(isTestSourcePath("src/__tests__/a.ts")).toBe(true);
    expect(isTestSourcePath("src/a.tsx")).toBe(false);
  });
});

describe("extractCopyStrings", () => {
  it("extracts quoted Japanese string literals", () => {
    expect(extractCopyStrings("const a = '削除しました'; const b = \"保存に失敗\";")).toEqual([
      "削除しました",
      "保存に失敗",
    ]);
  });

  it("extracts JSX text between tags", () => {
    expect(extractCopyStrings("<h1>家族グループを作成</h1>")).toEqual(["家族グループを作成"]);
  });

  it("extracts a bare JSX text line", () => {
    expect(extractCopyStrings("        家族グループを作成")).toEqual(["家族グループを作成"]);
  });

  it("excludes strings of two characters or fewer", () => {
    expect(extractCopyStrings("<button>削除</button>")).toEqual([]);
  });

  it("excludes strings without Japanese", () => {
    expect(extractCopyStrings("const a = 'primary-button'; <p>Hello world</p>")).toEqual([]);
  });

  it("excludes template literals with interpolation", () => {
    expect(extractCopyStrings("const a = `${name}さんを削除しました`;")).toEqual([]);
  });

  it("excludes comment lines", () => {
    expect(extractCopyStrings("// 家族グループを作成")).toEqual([]);
    expect(extractCopyStrings(" * 家族グループを作成")).toEqual([]);
  });
});

describe("findCopyDrift", () => {
  const e2eLines = [
    { file: "e2e/a.spec.ts", line: 3, text: 'await page.getByText("家族グループを作成").click();' },
    {
      file: "e2e/b.spec.ts",
      line: 7,
      text: 'await expect(page.getByText("家族グループを作成")).toHaveCount(0); // e2e-copy-drift: allow',
    },
    { file: "e2e/c.spec.ts", line: 1, text: "await page.goto('/');" },
  ];

  it("reports strings that remain in e2e and are gone from head src", () => {
    expect(
      findCopyDrift({ removedStrings: ["家族グループを作成"], headSrcText: "別の文言", e2eLines }),
    ).toEqual([{ file: "e2e/a.spec.ts", line: 3, copy: "家族グループを作成" }]);
  });

  it("does not report strings still present in head src", () => {
    expect(
      findCopyDrift({
        removedStrings: ["家族グループを作成"],
        headSrcText: "<h1>家族グループを作成</h1>",
        e2eLines,
      }),
    ).toEqual([]);
  });

  it("skips e2e lines carrying the allow marker", () => {
    const result = findCopyDrift({
      removedStrings: ["家族グループを作成"],
      headSrcText: "",
      e2eLines,
    });
    expect(result.map((item) => item.file)).toEqual(["e2e/a.spec.ts"]);
  });

  it("returns nothing when e2e does not contain the string", () => {
    expect(
      findCopyDrift({ removedStrings: ["存在しない文言"], headSrcText: "", e2eLines }),
    ).toEqual([]);
  });
});

describe("round 2: helper test files and quoted paths", () => {
  const diffFor = (header, body) =>
    [header, "--- a/x", "+++ b/x", "@@ -1,1 +1,1 @@", `-${body}`].join("\n");

  it("treats test helper files as test sources", () => {
    for (const filePath of [
      "src/components/GroupSettingsPanelTestMocks.tsx",
      "src/test/apiMock.ts",
      "src/lib/testFixtures.ts",
      "src/lib/testHelpers.ts",
    ]) {
      expect(isTestSourcePath(filePath), filePath).toBe(true);
    }
  });

  it("keeps E2E screen fixtures as sources because their values are rendered and asserted by E2E", () => {
    expect(isTestSourcePath("src/routing/e2eFixtures.ts")).toBe(false);
    const diff = diffFor(
      "diff --git a/src/routing/e2eFixtures.ts b/src/routing/e2eFixtures.ts",
      '  shopName: "ジャパン 明石稲美店",',
    );
    expect(parseRemovedSourceLines(diff)).toEqual(['  shopName: "ジャパン 明石稲美店",']);
  });

  it("does not extract removed lines of test helper files", () => {
    const diff = diffFor(
      "diff --git a/src/components/GroupSettingsPanelTestMocks.tsx b/src/components/GroupSettingsPanelTestMocks.tsx",
      "const a = '削除された文言です';",
    );
    expect(parseRemovedSourceLines(diff)).toEqual([]);
    const diff2 = diffFor(
      "diff --git a/src/test/apiMock.ts b/src/test/apiMock.ts",
      "const a = '削除された文言です';",
    );
    expect(parseRemovedSourceLines(diff2)).toEqual([]);
  });

  it("extracts removed lines for plain and quoted paths", () => {
    const body = "const a = '削除された文言です';";
    expect(
      parseRemovedSourceLines(
        diffFor("diff --git a/src/pages/Group.tsx b/src/pages/Group.tsx", body),
      ),
    ).toEqual([body]);
    expect(
      parseRemovedSourceLines(
        diffFor('diff --git "a/src/pages/家族.tsx" "b/src/pages/家族.tsx"', body),
      ),
    ).toEqual([body]);
  });
});

describe("round 2: e2e titles and comments", () => {
  const e2eLines = [
    { file: "e2e/a.spec.ts", line: 1, text: 'test("家族グループを作成できる", async () => {' },
    { file: "e2e/a.spec.ts", line: 2, text: '  test.describe("家族グループを作成", () => {' },
    {
      file: "e2e/a.spec.ts",
      line: 3,
      text: '  await test.step("家族グループを作成する", async () => {',
    },
    { file: "e2e/a.spec.ts", line: 4, text: '  test.only("家族グループを作成", async () => {' },
    { file: "e2e/a.spec.ts", line: 5, text: "  // 家族グループを作成 を押す" },
    { file: "e2e/a.spec.ts", line: 6, text: "  * 家族グループを作成" },
    {
      file: "e2e/a.spec.ts",
      line: 7,
      text: '  await page.getByText("家族グループを作成").click();',
    },
  ];

  it("ignores titles and comments but reports selector lines", () => {
    expect(
      findCopyDrift({ removedStrings: ["家族グループを作成"], headSrcText: "", e2eLines }),
    ).toEqual([{ file: "e2e/a.spec.ts", line: 7, copy: "家族グループを作成" }]);
  });
});
