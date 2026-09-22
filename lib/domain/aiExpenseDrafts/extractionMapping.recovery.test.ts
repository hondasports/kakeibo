import { describe, expect, it } from "vitest";
import { trialExternal8Fixture } from "../../convex/receiptImageExtraction/fixtures/taxFixtures";
import { mapExtractionToDraftArgs } from "./extractionMapping";
import { foodCategory } from "./testHelpers";

describe("mapExtractionToDraftArgs tax normalization (raw observation recovery)", () => {
  it("曖昧な価格付き抽出商品を削除せず確認対象に残す", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [{ ...product, itemName: "読取不鮮明商品", amountYen: 198, printedAmountYen: 198 }],
        rawObservations: [
          {
            rawText: "読取不鮮明商品 198円",
            amountText: "198円",
            amountYen: 198,
            lineRoleCandidates: ["item", "unknown"],
            roleConfidence: 0.2,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemName: "読取不鮮明商品" })]),
    );
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
  });

  it("未消費の明示価格商品をraw observationから復元する", () => {
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "コカ・コーラ 88円",
            amountText: "88円",
            amountYen: 88,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.98,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items).toEqual([
      expect.objectContaining({
        itemName: "コカ・コーラ",
        printedAmountYen: 88,
        warnings: expect.arrayContaining(["item_recovered_from_raw_observation"]),
      }),
    ]);
  });

  it("同名同額の複数行を一対一で対応させて重複復元しない", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 200,
        items: [
          { ...product, itemName: "同じ商品", amountYen: 100, printedAmountYen: 100 },
          { ...product, itemName: "同じ商品", amountYen: 100, printedAmountYen: 100 },
        ],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "同じ商品 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
          {
            rawText: "同じ商品 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 2,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items).toHaveLength(2);
    expect(mapped.items?.map((item) => item.printedAmountYen)).toEqual([100, 100]);
  });

  it("同名行の金額が食い違っても二重復元せず確認対象にする", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [{ ...product, itemName: "商品A", amountYen: 198, printedAmountYen: 198 }],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "商品A 188円",
            amountText: "188円",
            amountYen: 188,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items?.[0]).toMatchObject({ itemName: "商品A", printedAmountYen: 198 });
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
  });

  it("部分一致より完全一致するraw商品行を優先する", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 200,
        items: [{ ...product, itemName: "水", amountYen: 100, printedAmountYen: 100 }],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "天然水 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
          {
            rawText: "水 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 2,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items?.map((item) => item.itemName)).toEqual(["天然水", "水"]);
  });

  it("複数の部分一致raw候補は消費せず確認対象として保持する", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [{ ...product, itemName: "水", amountYen: 100, printedAmountYen: 100 }],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "天然水 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
          {
            rawText: "炭酸水 100円",
            amountText: "100円",
            amountYen: 100,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.99,
            explicitlyPrinted: true,
            sourceLineIndex: 2,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items?.map((item) => item.itemName)).toEqual(["天然水", "炭酸水", "水"]);
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
  });

  it("全明細のカテゴリが空でもレシート全体カテゴリを押し付けない", () => {
    const source = {
      ...trialExternal8Fixture,
      categoryName: "食費",
      items: trialExternal8Fixture.items!.map((item) => ({ ...item, categoryName: "" })),
    };
    const mapped = mapExtractionToDraftArgs(source, [foodCategory]);
    expect(mapped.categoryId).toBe(foodCategory._id);
    expect(mapped.items?.every((item) => item.categoryId === undefined)).toBe(true);
    expect(mapped.items?.every((item) => item.categoryName === undefined)).toBe(true);
  });
});
