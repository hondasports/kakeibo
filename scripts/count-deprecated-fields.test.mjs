import { describe, expect, it } from "vitest";
import {
  parseCliArgs,
  parseJsonResult,
  scanTable,
  scanVerify,
  TABLE_SPECS,
  validatePage,
} from "./count-deprecated-fields.mjs";

const itemPage = (overrides = {}) => ({
  scanned: 1,
  missingPrintedAmountYen: 1,
  missingLineType: 1,
  missingMarkers: 1,
  emptyMarkers: 1,
  markersAbsentOrEmptyWithTaxMarker: 1,
  withTaxMarker: 1,
  missingPrintedAmountYenWithNormalized: 0,
  missingPrintedAmountYenWithTaxFields: 0,
  missingPrintedAmountYenModifiedAfterInsert: 0,
  missingPrintedAmountYenInvestigationCandidates: 1,
  ...overrides,
});

const joinPage = (overrides = {}) => ({
  scanned: 1,
  missingPrintedRows: 1,
  createdAtBeforeDeployWindowStart: 0,
  createdAtInDeployWindow: 0,
  createdAtAtOrAfterDeployWindowEnd: 0,
  parentDraftMissing: 0,
  parentDraftGroupMismatch: 0,
  hasUserOverride: 0,
  interpretationAbsent: 0,
  interpretationNonAi: 0,
  interpretationItemsMalformed: 0,
  siblingsTruncated: 0,
  rowMissingFromSiblingIndex: 0,
  siblingCountDiffers: 0,
  ambiguousNameJoinTableSide: 0,
  noNameOverlap: 0,
  ambiguousNameJoin: 0,
  uniqueNameJoinEmbeddedPrintedMissing: 0,
  uniqueNameJoinPrintedEqualsAmount: 1,
  uniqueNameJoinPrintedDiffers: 0,
  uniqueNameJoinPositionConsistent: 1,
  ...overrides,
});

const ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
const fail = (stderr) => ({ status: 1, stdout: "", stderr });

const spec = TABLE_SPECS.aiExpenseDraftItems;

describe("parseJsonResult", () => {
  it("JSON 部分だけを取り出し、失敗時は生文字列を出さない", () => {
    expect(parseJsonResult('noise\n{"a":1}\n')).toEqual({ a: 1 });
    expect(() => parseJsonResult("SECRET-no-json")).toThrow("JSON");
    expect(() => parseJsonResult("SECRET-no-json")).not.toThrow("SECRET");
  });
});

describe("validatePage", () => {
  it("counter 欠落・isDone 不正・未完で cursor なしを拒否する", () => {
    expect(() =>
      validatePage(spec, { page: { scanned: 1 }, isDone: true, continueCursor: null }),
    ).toThrow("非負の数値ではありません");
    expect(() =>
      validatePage(spec, { page: itemPage(), isDone: "yes", continueCursor: null }),
    ).toThrow("isDone");
    expect(() =>
      validatePage(spec, { page: itemPage(), isDone: false, continueCursor: null }),
    ).toThrow("continueCursor");
  });
});

describe("scanTable", () => {
  it("複数ページで cursor を次呼び出しへ埋め込み、累計を返す", () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      const js = args[args.length - 1];
      if (js.includes("cursor: null")) {
        return ok({ page: itemPage({ scanned: 25 }), isDone: false, continueCursor: "c1" });
      }
      return ok({
        page: itemPage({ scanned: 10, withTaxMarker: 3 }),
        isDone: true,
        continueCursor: null,
      });
    };
    const result = scanTable(spec, { targetArgs: ["--prod"], numItems: 25, maxPages: 10, exec });
    expect(result.pages).toBe(2);
    expect(result.totals.scanned).toBe(35);
    expect(result.totals.withTaxMarker).toBe(4);
    expect(calls[0].slice(0, 3)).toEqual(["run", "--prod", "--inline-query"]);
    expect(calls[1].at(-1)).toContain('cursor: "c1"');
  });

  it("非0終了・不正JSON・cursor 矛盾・循環・上限超過で中止し stderr を出さない", () => {
    let thrown;
    try {
      scanTable(spec, {
        targetArgs: [],
        numItems: 1,
        maxPages: 5,
        exec: () => fail("SECRET-stderr"),
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown.message).toContain("失敗しました");
    expect(thrown.message).not.toContain("SECRET");
    expect(() =>
      scanTable(spec, {
        targetArgs: [],
        numItems: 1,
        maxPages: 5,
        exec: () => ({ status: 0, stdout: "not json", stderr: "" }),
      }),
    ).toThrow("JSON");
    expect(() =>
      scanTable(spec, {
        targetArgs: [],
        numItems: 1,
        maxPages: 5,
        exec: () => ok({ page: itemPage(), isDone: false, continueCursor: null }),
      }),
    ).toThrow("continueCursor");
    let n = 0;
    expect(() =>
      scanTable(spec, {
        targetArgs: [],
        numItems: 1,
        maxPages: 2,
        exec: () => ok({ page: itemPage(), isDone: false, continueCursor: `c${(n += 1)}` }),
      }),
    ).toThrow("ページ上限");
    // 循環: c1 -> c2 -> c1 を検知
    const seen = [];
    const cycled = ["c1", "c2", "c1"];
    expect(() =>
      scanTable(spec, {
        targetArgs: [],
        numItems: 1,
        maxPages: 10,
        exec: (args) => {
          seen.push(args.at(-1));
          return ok({
            page: itemPage(),
            isDone: false,
            continueCursor: cycled[seen.length - 1],
          });
        },
      }),
    ).toThrow("循環");
  });
});

describe("scanTable printedAmountJoinEvidence", () => {
  const joinSpec = TABLE_SPECS.printedAmountJoinEvidence;

  it("join エビデンス spec が counter 欠落を拒否し、deployWindow 境界と take 上限を JS に埋め込む", () => {
    expect(() =>
      validatePage(joinSpec, { page: { scanned: 1 }, isDone: true, continueCursor: null }),
    ).toThrow("非負の数値ではありません");
    const calls = [];
    const exec = (args) => {
      calls.push(args.at(-1));
      return ok({ page: joinPage(), isDone: true, continueCursor: null });
    };
    const result = scanTable(joinSpec, {
      targetArgs: [],
      numItems: 10,
      maxPages: 5,
      deployWindowStartTs: 150,
      deployWindowEndTs: 160,
      exec,
    });
    expect(result.totals.uniqueNameJoinPrintedEqualsAmount).toBe(1);
    expect(calls[0]).toContain("const ws = 150;");
    expect(calls[0]).toContain("const we = 160;");
    expect(calls[0]).toContain("createdAtInDeployWindow");
    expect(calls[0]).toContain(".take(101)");
    expect(calls[0]).toContain("ambiguousNameJoinTableSide");
    expect(calls[0]).toContain("parentDraftGroupMismatch");
    // 窓境界の省略時は undefined が埋め込まれる（日付バケットはカウントされない）
    scanTable(joinSpec, {
      targetArgs: [],
      numItems: 10,
      maxPages: 5,
      exec: (args) => {
        calls.push(args.at(-1));
        return ok({ page: joinPage(), isDone: true, continueCursor: null });
      },
    });
    expect(calls[1]).toContain("const ws = undefined;");
    expect(calls[1]).toContain("const we = undefined;");
    // start のみ指定時は end も undefined で埋め込まれ、inline 側で空窓に解決される
    scanTable(joinSpec, {
      targetArgs: [],
      numItems: 10,
      maxPages: 5,
      deployWindowStartTs: 150,
      exec: (args) => {
        calls.push(args.at(-1));
        return ok({ page: joinPage(), isDone: true, continueCursor: null });
      },
    });
    expect(calls[2]).toContain("const ws = 150;");
    expect(calls[2]).toContain("const we = undefined;");
  });
});

describe("scanVerify", () => {
  it("verify の page 別件数を cursor 付き args で合算する", () => {
    const calls = [];
    const exec = (args) => {
      calls.push(args);
      if (args.at(-1) === "{}") {
        return ok({
          remainingOrphaned: 2,
          unmigrated: 1,
          skipped: 1,
          isDone: false,
          continueCursor: "v1",
        });
      }
      return ok({
        remainingOrphaned: 1,
        unmigrated: 0,
        skipped: 0,
        isDone: true,
        continueCursor: null,
      });
    };
    const result = scanVerify({ targetArgs: ["--prod"], maxPages: 5, exec });
    expect(result.totals).toEqual({ remainingOrphaned: 3, unmigrated: 1, skipped: 1 });
    expect(calls[0].at(-2)).toBe("legacyGroupDeletionAuditMigration:verify");
    expect(calls[1].at(-1)).toBe('{"cursor":"v1"}');
  });
});

describe("parseCliArgs", () => {
  it("対象指定は必須かつ排他で、auditVerify とテーブル名を受理する", () => {
    expect(() => parseCliArgs([])).toThrow("対象 deployment");
    expect(() => parseCliArgs(["--prod", "--dev"])).toThrow("1つだけ");
    expect(() => parseCliArgs(["--prod", "--deployment", "prod:x"])).toThrow("1つだけ");
    expect(
      parseCliArgs(["--prod", "--tables", "auditVerify,aiExpenseDraftItems"]).opts.tables,
    ).toEqual(["auditVerify", "aiExpenseDraftItems"]);
    expect(() => parseCliArgs(["--prod", "--tables", "unknownTable"])).toThrow("不明なテーブル");
    expect(() => parseCliArgs(["--prod", "--num-items", "0"])).toThrow("--num-items");
  });
});
