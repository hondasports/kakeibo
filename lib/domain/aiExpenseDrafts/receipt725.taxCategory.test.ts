import { describe, expect, it } from "vitest";
import { trialExternal8Fixture } from "../../convex/receiptImageExtraction/fixtures/taxFixtures";
import { mapExtractionToDraftArgs } from "./extractionMapping";

import { prepareReceiptItemEvidence } from "./receiptItemEvidence";
import { categories, item, Row, observations, map, check } from "./testHelpers";

describe("725 production receipt regressions (tax and categories)", () => {
  it("recovers a missing tax rate without duplicating or overwriting supplied tax summaries", () => {
    const rawObservations = observations([
      ["食品 ¥100", 100, "¥100"],
      ["用品 ¥220", 220, "¥220"],
      ["8%外税 対象 ¥100", 100, "¥100", "tax"],
      ["8%外税 ¥8", 8, "¥8", "tax"],
      ["10%内税 対象 ¥220", 220, "¥220", "tax"],
      ["10%内税 ¥20", 20, "¥20", "tax"],
    ]);
    const source = {
      ...trialExternal8Fixture,
      amountYen: 328,
      items: [item("食品", 100), item("用品", 220)],
      rawObservations,
      taxSummaries: [],
    };
    const full = mapExtractionToDraftArgs(source, categories);
    const supplied = full.taxSummaries!.filter((s) => s.taxRatePercent === 10);
    const partial = mapExtractionToDraftArgs({ ...source, taxSummaries: supplied }, categories);
    expect(partial.taxSummaries).toHaveLength(2);
    expect(partial.items!.reduce((sum, i) => sum + i.amountYen, 0)).toBe(328);
    expect(partial.taxSummaries!.find((s) => s.taxRatePercent === 8)?.taxYen).toBe(8);
    const conflict = mapExtractionToDraftArgs(
      { ...source, taxSummaries: supplied.map((s) => ({ ...s, taxYen: 99 })) },
      categories,
    );
    expect(conflict.taxSummaries!.filter((s) => s.taxRatePercent === 10)).toHaveLength(1);
    expect(conflict.taxSummaries!.find((s) => s.taxRatePercent === 10)?.taxYen).toBe(99);
  });

  it("uses corroborated unknown product rows to separate merged names, without promoting footer labels", () => {
    const raw = observations([
      ["コーラ ¥88", 88, "¥88", "unknown"],
      ["キャメル ¥1060", 1060, "¥1060", "unknown"],
      ["合計 ¥1148", 1148, "¥1148", "unknown"],
      ["不明 ¥999", 999, "¥999", "unknown"],
    ]);
    const result = prepareReceiptItemEvidence([item("コーラキャメル", 1060)], raw);
    expect(result.items[0].itemName).toBe("キャメル");
    expect(result.lines.slice(0, 2).every((line) => line.lineRoleCandidates.includes("item"))).toBe(
      true,
    );
    expect(result.lines.slice(2).every((line) => line.lineRoleCandidates.includes("unknown"))).toBe(
      true,
    );
    expect(raw.every((line) => line.lineRoleCandidates.includes("unknown"))).toBe(true);
  });

  it("does not fill missing mixed receipt categories from the shop category", () => {
    const result = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        categoryName: "医療",
        items: [
          { ...item("カルピスソーダ", 85), categoryName: "" },
          { ...item("キャメル", 1060), categoryName: "その他" },
        ],
      },
      categories,
    );
    expect(result.items!.map((i) => i.categoryId)).toEqual([undefined, "その他"]);
  });

  it("does not recover point balances mentioned inside an AI merged name as products", () => {
    const result = map(
      [item("牛乳ポイント残高", 200)],
      [
        ["牛乳 ¥200", 200, "¥200", "unknown"],
        ["ポイント残高 100", 100, "100", "unknown"],
      ],
      200,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items![0].amountYen).toBe(200);
    expect(result.rawObservationLines![1].lineRoleCandidates).toEqual(["unknown"]);
  });

  it("715 keeps six products, not a merged seventh candidate", () => {
    const names = [
      "コカ・コーラゼロカフェ",
      "内ヒキャメル・メンソール・2コ×単530",
      "世界のキッチンからソル",
      "GREENDAKARAやさしい麦",
      "マンハッタン",
      "柿の種&ピーナッツ",
    ];
    const amounts = [88, 1060, 88, 78, 108, 398];
    const result = map(
      [item(names[0] + names[1], 1060), ...names.slice(2).map((n, i) => item(n, amounts[i + 2]))],
      [
        ...names.map((n, i): Row => [n + ` ¥${amounts[i]}`, amounts[i], `¥${amounts[i]}`]),
        ["8%外税 対象 ¥760", 760, "¥760", "tax"],
        ["8%外税 ¥60", 60, "¥60", "tax"],
        ["10%内税 対象 ¥1060", 1060, "¥1060", "tax"],
        ["10%内税 ¥96", 96, "¥96", "tax"],
      ],
      1880,
    );
    check(result, 6, 1880);
  });
});
