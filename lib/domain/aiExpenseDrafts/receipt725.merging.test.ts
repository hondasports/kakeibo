import { describe, expect, it } from "vitest";

import { prepareReceiptItemEvidence } from "./receiptItemEvidence";
import { item, Row, observations, map, check } from "./testHelpers";

describe("725 production receipt regressions (merged candidate handling)", () => {
  it("716 remains two included items", () => {
    const result = map(
      [{ ...item("inタブレット塩分+", 204), categoryName: "医療" }, item("ルヴァン黒糖", 193)],
      [
        ["inタブレット塩分+ ¥204", 204, "¥204"],
        ["ルヴァン黒糖 ¥193", 193, "¥193"],
        ["内税8%対象 ¥397", 397, "¥397", "tax"],
        ["内税8% ¥29", 29, "¥29", "tax"],
      ],
      397,
    );
    check(result, 2, 397);
    expect(result.items!.map((i) => i.categoryId)).toEqual(["医療", "食費"]);
  });

  it("preserves two genuinely repeated identical products and their categories", () => {
    const result = map(
      [item("パン", 100), item("パン", 100)],
      [
        ["※パン ¥100", 100, "¥100"],
        ["※パン ¥100", 100, "¥100"],
        ["内税8%対象 ¥200", 200, "¥200", "tax"],
        ["内税8% ¥14", 14, "¥14", "tax"],
      ],
      200,
    );
    check(result, 2, 200);
    expect(result.items!.map((i) => i.categoryId)).toEqual(["食費", "食費"]);
  });

  it("does not discard numeric products without supporting raw evidence", () => {
    expect(prepareReceiptItemEvidence([item("12345678", 100)], []).items).toHaveLength(1);
  });

  it("removes a merged candidate when the separate priced product already exists", () => {
    const result = prepareReceiptItemEvidence(
      [item("コーラ", 88), item("キャメル", 1060), item("コーラキャメル", 1060)],
      observations([
        ["コーラ ¥88", 88, "¥88"],
        ["キャメル ¥1060", 1060, "¥1060"],
      ]),
    );
    expect(result.items.map((i) => i.itemName)).toEqual(["コーラ", "キャメル"]);
  });

  it("removes an ambiguous merged candidate when distinct products share its amount", () => {
    const rows: Row[] = [
      ["商品A ¥100", 100, "¥100"],
      ["商品B ¥100", 100, "¥100"],
    ];
    const result = prepareReceiptItemEvidence(
      [item("商品A商品B", 100), item("商品A", 100), item("商品B", 100)],
      observations(rows),
    );
    expect(result.items.map((i) => i.itemName)).toEqual(["商品A", "商品B"]);
    const mapped = map(
      [item("商品A商品B", 100), item("商品A", 100), item("商品B", 100)],
      rows,
      200,
    );
    expect(mapped.items?.map((i) => i.itemName)).toEqual(["商品A", "商品B"]);
  });

  it("preserves exact items when same-price product names contain one another", () => {
    const rows: Row[] = [
      ["コーラ ¥100", 100, "¥100"],
      ["ゼロコーラ ¥100", 100, "¥100"],
    ];
    const result = prepareReceiptItemEvidence(
      [item("コーラ", 100), item("ゼロコーラ", 100)],
      observations(rows),
    );
    expect(result.items.map((i) => i.itemName)).toEqual(["コーラ", "ゼロコーラ"]);
    const mapped = map([item("コーラ", 100), item("ゼロコーラ", 100)], rows, 200);
    expect(mapped.items?.map((i) => i.itemName)).toEqual(["コーラ", "ゼロコーラ"]);
  });

  it("does not merge conflicting adjacent amounts or mutate original observations", () => {
    const raw = observations([
      ["商品 ¥100", 100, "¥100"],
      ["12345678 ¥200", 200, "¥200"],
    ]);
    const original = structuredClone(raw);
    expect(prepareReceiptItemEvidence([], raw).lines).toHaveLength(2);
    expect(raw).toEqual(original);
  });
});
