import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { observationLine, unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";

function allocated(input = unprovenTargetReceipt()) {
  return reinterpretDraftTax(input).itemFields.every(
    (item) => item.taxAllocationStatus === "allocated",
  );
}

describe("確認済み明細と独立した印字証拠からの税計算", () => {
  it("小計を含む実再現で4,373円の手修正なしに4,810円と437円が一致する", () => {
    const input = unprovenTargetReceipt();
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(result.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(4810);
    expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(437);
    expect(input.taxSummaries[0].taxableAmountYen).toBe(4373);
  });

  it("保存済みの対象額・税額・手修正metadataを次の計算の根拠にしない", () => {
    const input = unprovenTargetReceipt();
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxableAmountYen: 1,
      taxYen: 999,
      valueOrigin: { source: "user" },
      userEditedFields: ["taxableAmountYen", "taxYen"],
    };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
    });
  });

  it("再表示で前回の計算結果を使っても原文から同じ結果を導出する", () => {
    const input = unprovenTargetReceipt();
    const first = reinterpretDraftTax(input);
    const reopened = reinterpretDraftTax({
      ...input,
      taxSummaries: first.interpretation.taxSummaries,
    });
    expect(reopened.itemFields).toEqual(first.itemFields);
    expect(reopened.interpretation.taxSummaries).toEqual(first.interpretation.taxSummaries);
  });

  it("商品金額が変われば前回一致した結果に拘束されず再計算する", () => {
    const input = unprovenTargetReceipt();
    const first = reinterpretDraftTax(input);
    input.items[0].printedAmountYen = 980;
    const next = reinterpretDraftTax({ ...input, taxSummaries: first.interpretation.taxSummaries });
    expect(next.interpretation.taxSummaries[0].taxableAmountYen).toBe(4800);
    expect(next.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it.each([
    "10%対象 4,373円",
    "10%税込 4,373円",
    "10%合計 4,373円",
    "小計 4,000円",
    "消費税10% 999円",
    "外税10% 437円",
  ])("%s の矛盾は保持する", (rawText) => {
    const input = unprovenTargetReceipt();
    const amount = rawText.includes("4,000")
      ? 4000
      : rawText.includes("999")
        ? 999
        : rawText.includes("437円")
          ? 437
          : 4373;
    input.rawObservationLines!.push(observationLine(rawText, amount, 3));
    expect(allocated(input)).toBe(false);
  });

  it.each(["10%対象 読取不能", "消費税額10% 読取不能", "内税10% 判読不能", "税率 ?% 437円"])(
    "%s の証拠不足を確定しない",
    (rawText) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push({
        ...observationLine(rawText, 0, 3),
        amountYen: null,
        amountText: null,
      });
      expect(allocated(input)).toBe(false);
    },
  );

  it.each(["payment", "change"] as const)("%s の行を税額の証拠にしない", (role) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].lineRoleCandidates = [role];
    expect(allocated(input)).toBe(false);
  });

  it("印字合計との食い違いを計算値で上書きしない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![0].amountYen = 4800;
    expect(allocated(input)).toBe(false);
  });

  it("明細欠落・重複では一致しない", () => {
    const input = unprovenTargetReceipt();
    input.items.pop();
    expect(allocated(input)).toBe(false);
    input.items.push(input.items[0], input.items[0]);
    expect(allocated(input)).toBe(false);
  });

  it("8%・10%混在でも各税率の独立した税額から配分できる", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 2180;
    input.items = [
      { ...input.items[0], printedAmountYen: 1080, taxRatePercent: 8 },
      { ...input.items[0], printedAmountYen: 1100, taxRatePercent: 10 },
    ];
    input.rawObservationLines = [
      observationLine("合計 2180円", 2180, 0),
      observationLine("内消費税8% 80円", 80, 1),
      observationLine("内消費税10% 100円", 100, 2),
      observationLine("小計2180円", 2180, 3),
    ];
    expect(allocated(input)).toBe(true);
    expect(reinterpretDraftTax(input).itemFields.map((item) => item.allocatedTaxYen)).toEqual([
      80, 100,
    ]);
  });

  it("税率の帰属が不明な混在税額は誤配分しない", () => {
    const input = unprovenTargetReceipt();
    input.items[0].taxRatePercent = 8;
    input.rawObservationLines![1].rawText = "内消費税437円";
    expect(allocated(input)).toBe(false);
  });

  it("税率と割引対象が確定した割引を含めて再計算する", () => {
    const input = unprovenTargetReceipt();
    input.items.push({ ...input.items[0], itemName: "割引", printedAmountYen: -110 });
    input.amountYen = 4700;
    input.rawObservationLines = [
      observationLine("合計4700円", 4700, 0),
      observationLine("内消費税10% 427円", 427, 1),
    ];
    expect(allocated(input)).toBe(true);
    expect(
      reinterpretDraftTax(input).itemFields.reduce(
        (sum, item) => sum + item.normalizedAmountYen,
        0,
      ),
    ).toBe(4700);
  });

  it("税率未確定の割引は誤確定しない", () => {
    const input = unprovenTargetReceipt();
    input.items.push({
      ...input.items[0],
      itemName: "割引",
      printedAmountYen: -110,
      taxRatePercent: null,
      amountBasis: "unknown",
    });
    expect(allocated(input)).toBe(false);
  });
  it("税合計を支払総額と取り違えない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].rawText = "税合計10% 437円";
    expect(allocated(input)).toBe(true);
  });

  it("課税商品と非課税商品が混在しても、課税税率が一つなら省略された税額を帰属できる", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1600;
    input.items = [
      { ...input.items[0], printedAmountYen: 1100, taxRatePercent: 10 },
      { ...input.items[0], printedAmountYen: 500, taxRatePercent: 0 },
    ];
    input.rawObservationLines = [
      observationLine("合計1600円", 1600, 0),
      observationLine("内消費税100円", 100, 1),
    ];
    const result = reinterpretDraftTax(input);
    expect(result.itemFields.map((item) => item.allocatedTaxYen)).toEqual([100, 0]);
    expect(allocated(input)).toBe(true);
  });

  it.each([undefined, "discount", "promotion_adjustment"] as const)(
    "割引前の小計を割引後の対象額と取り違えない（%s）",
    (lineType) => {
      const input = unprovenTargetReceipt();
      input.amountYen = 990;
      input.items = [
        { ...input.items[0], printedAmountYen: 1100 },
        {
          ...input.items[0],
          itemName: lineType ? "会員特典" : "割引",
          lineType,
          printedAmountYen: -110,
        },
      ];
      input.rawObservationLines = [
        observationLine("小計1100円", 1100, 0),
        observationLine("合計990円", 990, 1),
        observationLine("内消費税10% 90円", 90, 2),
      ];
      expect(allocated(input)).toBe(true);
      expect(reinterpretDraftTax(input).itemFields.map((item) => item.allocatedTaxYen)).toEqual([
        100, -10,
      ]);
    },
  );

  it("税率不明の印字対象額を混在税率に割り当てて確定しない", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 2180;
    input.items = [
      { ...input.items[0], printedAmountYen: 1080, taxRatePercent: 8 },
      { ...input.items[0], printedAmountYen: 1100, taxRatePercent: 10 },
    ];
    input.rawObservationLines = [
      observationLine("合計2180円", 2180, 0),
      observationLine("内消費税8% 80円", 80, 1),
      observationLine("内消費税10% 100円", 100, 2),
      observationLine("課税対象9999円", 9999, 3),
    ];
    expect(allocated(input)).toBe(false);
  });

  it("旧形式の明示的な税額訂正は原文と分けて記録し、再表示でも保持する", () => {
    const input = unprovenTargetReceipt();
    input.correctedTaxSummaries = [
      { ...input.taxSummaries[0], taxYen: 438, userEditedFields: ["taxYen"] },
    ];
    const first = reinterpretDraftTax(input);
    const reopened = reinterpretDraftTax({
      ...input,
      taxSummaries: first.interpretation.taxSummaries,
    });
    for (const result of [first, reopened]) {
      expect(result.interpretation.decision.taxAmount).toMatchObject({
        printedTaxYen: 437,
        userConfirmedTaxYen: 438,
        source: "user",
      });
      expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(438);
      expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(
        true,
      );
    }
    expect(input.rawObservationLines![1].amountYen).toBe(437);
  });

  it("計算値を許可しない旧データで不正な税額だけを根拠に確定しない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = [];
    input.items = input.items.map((item) => ({ ...item, taxResolutionSource: "single_summary" }));
    input.taxSummaries[0].taxYen = 999;
    expect(allocated(input)).toBe(false);
  });
  it("税抜明細と税込対象額の原文を同じ基準へ換算して照合する", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 436;
    input.items = [98, 138, 168].map((printedAmountYen) => ({
      ...input.items[0],
      printedAmountYen,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
    }));
    input.rawObservationLines = [
      observationLine("小計404円", 404, 0),
      observationLine("外税8%32円", 32, 1),
      observationLine("合計436円", 436, 2),
      observationLine("税率8%対象額436円", 436, 3),
      observationLine("内消費税等8%32円", 32, 4),
    ];
    expect(allocated(input)).toBe(true);
    expect(reinterpretDraftTax(input).itemFields.map((item) => item.normalizedAmountYen)).toEqual([
      106, 149, 181,
    ]);
  });

  it.each([180, 999])("混在税率の消費税合計%d円を各税率の印字税額の合計と照合する", (totalTax) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 2180;
    input.items = [
      { ...input.items[0], printedAmountYen: 1080, taxRatePercent: 8 },
      { ...input.items[0], printedAmountYen: 1100, taxRatePercent: 10 },
    ];
    input.rawObservationLines = [
      observationLine("合計2180円", 2180, 0),
      observationLine("内消費税8%80円", 80, 1),
      observationLine("内消費税10%100円", 100, 2),
      observationLine("消費税合計" + totalTax + "円", totalTax, 3),
    ];
    expect(allocated(input)).toBe(totalTax === 180);
  });

  it("金額が読めても税率が読めない印字税額を捨てて確定しない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(observationLine("消費税 ?% 999円", 999, 3));
    expect(allocated(input)).toBe(false);
  });

  it.each([
    "税率10%",
    "税率10.0%",
    "税率8.00%",
    "※税率10%",
    "消費税率10%",
    "適用税率10%",
    "tax rate 10%",
  ])("%s の宣言を読取不能の税額と取り違えない", (rawText) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push({
      ...observationLine(rawText, 0, 3),
      amountYen: null,
      amountText: null,
    });
    expect(allocated(input)).toBe(true);
  });

  it.each([0, 1])("商品がない8%%欄の%d円を検証する", (amount) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(
      observationLine("8%対象" + amount + "円", amount, 3),
      observationLine("内消費税8%" + amount + "円", amount, 4),
    );
    expect(allocated(input)).toBe(amount === 0);
  });

  it("同率の先頭が未編集でも後続の明示的な税額訂正を保持する", () => {
    const input = unprovenTargetReceipt();
    input.correctedTaxSummaries = [
      input.taxSummaries[0],
      { ...input.taxSummaries[0], taxYen: 438, userEditedFields: ["taxYen"] },
    ];
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxYen).toBe(438);
    expect(result.interpretation.decision.taxAmount.userConfirmedTaxYen).toBe(438);
    expect(allocated(input)).toBe(true);
    input.correctedTaxSummaries[0] = { ...input.taxSummaries[0], userEditedFields: ["taxYen"] };
    expect(allocated(input)).toBe(false);
  });
  it("原文に他税率の0円欄だけがあっても全体確認の税計算を妨げない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = [
      { ...observationLine("合計4810円", 4810, 0), lineRoleCandidates: ["total"] },
      observationLine("8%対象0円", 0, 1),
      observationLine("内消費税8%0円", 0, 2),
    ];
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    expect(allocated(input)).toBe(true);
  });
  it.each([{ taxYen: 0 }, { taxYen: 5 }])(
    "0%商品に印字された内消費税$taxYen円を無視しない",
    ({ taxYen }) => {
      const input = unprovenTargetReceipt();
      input.items = input.items.map((item) => ({ ...item, taxRatePercent: 0 }));
      input.rawObservationLines = [
        { ...observationLine("合計4810円", 4810, 0), lineRoleCandidates: ["total"] },
        observationLine("内消費税" + taxYen + "円", taxYen, 1),
      ];
      const result = reinterpretDraftTax(input);
      expect(result.interpretation.taxSummaries[0].status === "verified").toBe(taxYen === 0);
      expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(
        taxYen === 0,
      );
    },
  );
  it("0%商品に対する非0の明示税額訂正を捨てて確定しない", () => {
    const input = unprovenTargetReceipt();
    input.items = input.items.map((item) => ({ ...item, taxRatePercent: 0 }));
    input.rawObservationLines = [
      { ...observationLine("合計4810円", 4810, 0), lineRoleCandidates: ["total"] },
    ];
    input.correctedTaxSummaries = [
      { ...input.taxSummaries[0], taxRatePercent: 0, taxYen: 5, userEditedFields: ["taxYen"] },
    ];
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      status: "contradictory",
      taxYen: 5,
    });
    expect(result.interpretation.decision.taxAmount.userConfirmedTaxYen).toBe(5);
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });
});
