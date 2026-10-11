import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { observationLine, unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";

describe("出所不明の対象額の再計算", () => {
  it.each([
    "税込10% 消費税額",
    "消費税合計10%",
    "10%対象消費税",
    "10%消費税小計",
    "10.0%消費税小計",
  ])("税額の明示 %s を税込・合計の対象額と取り違えない", (label) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].rawText = `${label} 437円`;
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
      valueOrigin: { source: "items", previousTaxableAmountYen: 4373 },
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
  });

  it.each(["missing", "stale"])(
    "商品・合計の原文だけなら全体選択から%sサマリを再計算できる",
    (kind) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines = [
        { ...observationLine("商品1 990円", 990, 0), lineRoleCandidates: ["item"] },
        { ...observationLine("税込合計 4,810円", 4810, 1), lineRoleCandidates: ["total"] },
      ];
      if (kind === "missing") input.taxSummaries = [];
      else input.taxSummaries[0].taxRatePercent = 8;
      input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
      const result = reinterpretDraftTax(input);
      expect(result.interpretation.taxSummaries[0]).toMatchObject({
        taxableAmountYen: 4810,
        taxRatePercent: 10,
        taxYen: 437,
        valueOrigin: { source: "items" },
      });
      expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(
        true,
      );
      expect(result.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(4810);
    },
  );

  it.each(["消費税 999円", "10%対象 4,373円", "対象額 4,373円", "小計 4,373円"])(
    "独立した税内訳 %s がある場合は全体選択でも合成しない",
    (rawText) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines = [
        observationLine(rawText, rawText.includes("999") ? 999 : 4373, 0),
      ];
      input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
      const result = reinterpretDraftTax(input);
      expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
      expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
        true,
      );
    },
  );

  it.each([
    ["TAX10% 999円", "unknown"],
    ["税計 999円", "unknown"],
    ["10% 4,373円", "unknown"],
    ["税込 ?% 4,373円", "unknown"],
    ["対象税率10% 4,373円", "tax"],
    ["判読不能 999円", "tax"],
    ["判読不能 4,373円", "subtotal"],
  ] as const)("曖昧な税内訳 %s (%s) を全体選択で捨てない", (rawText, role) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = [
      { ...observationLine("合計 4,810円", 4810, 0), lineRoleCandidates: ["total"] },
      {
        ...observationLine(rawText, rawText.includes("999") ? 999 : 4373, 1),
        lineRoleCandidates: [role],
      },
    ];
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it.each(["item", "discount"] as const)("%付きの%s行は全体選択による合成を妨げない", (role) => {
    const input = unprovenTargetReceipt();
    input.taxSummaries = [];
    input.rawObservationLines = [
      { ...observationLine("10%引 180円", 180, 0), lineRoleCandidates: [role] },
    ];
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      valueOrigin: { source: "items" },
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
  });

  it("税額だけの編集は対象額をユーザー由来にせず、保存後の商品確認から再計算できる", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = undefined;
    input.summaryOverride = { index: 0, summary: { taxYen: 437 } };
    const saved = reinterpretDraftTax(input);
    expect(saved.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4373,
      valueOrigin: { source: "unknown" },
    });
    expect(
      saved.interpretation.taxSummaries[0].valueOrigin?.previousTaxableAmountYen,
    ).toBeUndefined();
    const reopened = reinterpretDraftTax({
      ...unprovenTargetReceipt(),
      taxSummaries: saved.interpretation.taxSummaries,
      taxSummariesUserConfirmed: true,
    });
    expect(reopened.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      valueOrigin: { source: "items", previousTaxableAmountYen: 4373 },
    });
  });

  it.each(["items", "user"] as const)(
    "税額だけの編集でも既存の対象額の出所%sを保持する",
    (source) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines = undefined;
      input.taxSummaries[0].valueOrigin = { source, previousTaxableAmountYen: 4000 };
      input.summaryOverride = { index: 0, summary: { taxYen: 999 } };
      expect(reinterpretDraftTax(input).interpretation.taxSummaries[0].valueOrigin).toEqual(
        input.taxSummaries[0].valueOrigin,
      );
    },
  );

  it.each([
    { taxMode: "external" as const },
    { taxableAmountBasis: "tax_excluded" as const },
    { taxIncludedAmountYen: 9999 },
  ])("対象額以外の手修正%sも保存・再表示で自動上書きしない", (override) => {
    const input = unprovenTargetReceipt();
    input.summaryOverride = { index: 0, summary: override };
    const saved = reinterpretDraftTax(input);
    expect(saved.interpretation.taxSummaries[0]).toMatchObject({
      ...override,
      valueOrigin: { source: "unknown" },
    });
    const reopened = reinterpretDraftTax({
      ...unprovenTargetReceipt(),
      taxSummaries: saved.interpretation.taxSummaries,
      taxSummariesUserConfirmed: true,
    });
    expect(reopened.interpretation.taxSummaries[0]).toMatchObject(override);
    expect(reopened.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it.each(["商品A 税込10% 990円", "商品A 税抜10.0% 990円"])(
    "税区分付き商品%sも独立した対象額にしない",
    (rawText) => {
      const input = unprovenTargetReceipt();
      const itemLine = {
        ...observationLine(rawText, 990, 2),
        lineRoleCandidates: ["item" as const],
      };
      input.rawObservationLines!.push(itemLine);
      expect(reinterpretDraftTax(input).interpretation.taxSummaries[0].taxableAmountYen).toBe(4810);
      input.taxSummaries = [];
      input.rawObservationLines = [itemLine];
      input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
      expect(reinterpretDraftTax(input).interpretation.taxSummaries[0]).toMatchObject({
        taxableAmountYen: 4810,
        status: "verified",
      });
    },
  );

  it("小数表記の直接対象額は全体指定でも上書きしない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(observationLine("10.0%対象額 4,373円", 4373, 2));
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    expect(reinterpretDraftTax(input).interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
  });

  it.each(["10%対象額 4,373円", "消費税10% 999円"])(
    "商品候補に誤分類された明示税内訳%sも捨てない",
    (rawText) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push({
        ...observationLine(rawText, rawText.includes("999") ? 999 : 4373, 2),
        lineRoleCandidates: ["item"],
      });
      for (const decisionOverride of [
        undefined,
        { priceTaxTreatment: "included" as const, taxRateComposition: "rate10" as const },
      ]) {
        const result = reinterpretDraftTax({ ...input, decisionOverride });
        expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
        expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
          true,
        );
      }
    },
  );

  it("商品確認だけで4,810円と437円を整合させ、元の対象額と原文を保持する", () => {
    const input = unprovenTargetReceipt();
    input.items[0].warnings = ["amount_mismatch", "unresolved_tax_rate", "unresolved_amount_basis"];
    const original = structuredClone(input);
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
      valueOrigin: { source: "items", previousTaxableAmountYen: 4373 },
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(437);
    expect(
      result.itemFields.every(
        (item) =>
          !item.warnings.some((warning) =>
            ["amount_mismatch", "unresolved_tax_rate", "unresolved_amount_basis"].includes(warning),
          ),
      ),
    ).toBe(true);
    expect(input).toEqual(original);
    const reopened = reinterpretDraftTax({
      ...input,
      taxSummaries: result.interpretation.taxSummaries,
    });
    expect(reopened.itemFields).toEqual(result.itemFields);
  });

  it.each([8, 10] as const)("%s%%外税でも原文の合計と税額の両方で照合する", (rate) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1000 + rate * 10;
    input.items = [
      {
        itemName: "商品",
        printedAmountYen: 1000,
        amountBasis: "tax_excluded",
        taxRatePercent: rate,
      },
    ];
    input.taxSummaries = [
      { ...input.taxSummaries[0], taxRatePercent: rate, taxableAmountYen: 800, taxYen: rate * 10 },
    ];
    input.rawObservationLines = [
      observationLine(`合計 ${input.amountYen}円`, input.amountYen, 0),
      observationLine(`消費税${rate}% ${rate * 10}円`, rate * 10, 1),
    ];
    const result = reinterpretDraftTax(input);
    expect(result.itemFields[0]).toMatchObject({
      normalizedAmountYen: input.amountYen,
      allocatedTaxYen: rate * 10,
      taxAllocationStatus: "allocated",
    });
  });

  it("原文の外税ラベルと商品の税込指定が矛盾する場合は補正しない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].rawText = "外税10% 437円";
    input.taxSummaries[0].taxMode = "external";
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it.each(["10%税込", "10%合計", "10%課税売上", "10%対象", "10%課税対象額（消費税）"])(
    "別形式の印字対象額 %s も上書きしない",
    (label) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push(observationLine(`${label} 4,373円`, 4373, 2));
      expect(reinterpretDraftTax(input).interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    },
  );

  it("印字対象額やユーザー修正値は自動上書きしない", () => {
    for (const mode of ["printed", "user", "legacy-user"] as const) {
      const input = unprovenTargetReceipt();
      if (mode === "printed")
        input.rawObservationLines!.push(observationLine("10%対象 4,373円", 4373, 2));
      if (mode === "user") input.taxSummaries[0].valueOrigin = { source: "user" };
      if (mode === "legacy-user") input.taxSummariesUserConfirmed = true;
      const result = reinterpretDraftTax(input);
      expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
      expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
        true,
      );
    }
  });

  it("全体税区分を選んでも独立した印字矛盾は捨てない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(observationLine("10%対象 4,373円", 4373, 2));
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it("原文のない全体設定が再表示時に手修正した対象額を捨てない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = undefined;
    input.summaryOverride = { index: 0, summary: { taxableAmountYen: 4800 } };
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const saved = reinterpretDraftTax(input);
    const reopened = reinterpretDraftTax({
      ...input,
      summaryOverride: undefined,
      taxSummaries: saved.interpretation.taxSummaries,
    });
    expect(saved.interpretation.taxSummaries[0].taxableAmountYen).toBe(4800);
    expect(reopened.interpretation.taxSummaries[0]).toEqual(saved.interpretation.taxSummaries[0]);
    expect(reopened.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it("手修正の根拠を保存し、その後の商品変更で上書きしない", () => {
    const input = unprovenTargetReceipt();
    input.summaryOverride = { index: 0, summary: { taxableAmountYen: 4800 } };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4800,
      valueOrigin: { source: "user" },
    });
    expect(
      reinterpretDraftTax({
        ...input,
        summaryOverride: undefined,
        taxSummaries: result.interpretation.taxSummaries,
      }).interpretation.taxSummaries[0].taxableAmountYen,
    ).toBe(4800);
  });
});
