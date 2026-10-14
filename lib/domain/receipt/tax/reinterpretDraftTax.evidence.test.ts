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
  it.each([
    [91, 91],
    [91, 999],
    [999, 91],
  ])("同率の旧税額候補%sを順序で選んで確定しない", (firstTax, secondTax) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1000;
    input.items = [{ ...input.items[0], printedAmountYen: 1000 }];
    input.rawObservationLines = [];
    input.taxSummaries = [firstTax, secondTax].map((taxYen) => ({
      ...input.taxSummaries[0],
      taxYen,
    }));
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].status === "verified").toBe(
      firstTax === secondTax,
    );
    expect(result.itemFields[0].taxAllocationStatus === "allocated").toBe(firstTax === secondTax);
  });
  it("同率の旧税額候補が矛盾しても明示的な税額訂正を優先する", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1000;
    input.items = [{ ...input.items[0], printedAmountYen: 1000 }];
    input.rawObservationLines = [];
    input.taxSummaries = [91, 999].map((taxYen) => ({ ...input.taxSummaries[0], taxYen }));
    input.correctedTaxSummaries = [
      { ...input.taxSummaries[0], taxYen: 91, userEditedFields: ["taxYen"] },
    ];
    expect(allocated(input)).toBe(true);
    expect(reinterpretDraftTax(input).interpretation.decision.taxAmount.userConfirmedTaxYen).toBe(
      91,
    );
  });

  it.each(["内消費税", "外税額"])("0%の%sは明示訂正した0円を原文5円と分けて扱う", (label) => {
    const input = unprovenTargetReceipt();
    input.items = input.items.map((item) => ({ ...item, taxRatePercent: 0 }));
    input.rawObservationLines = [
      { ...observationLine("合計4810円", 4810, 0), lineRoleCandidates: ["total"] },
      observationLine(label + "5円", 5, 1),
    ];
    input.correctedTaxSummaries = [
      { ...input.taxSummaries[0], taxRatePercent: 0, taxYen: 0, userEditedFields: ["taxYen"] },
    ];
    const result = reinterpretDraftTax(input);
    expect(allocated(input)).toBe(true);
    expect(result.interpretation.decision.taxAmount).toMatchObject({
      printedTaxYen: 5,
      userConfirmedTaxYen: 0,
      source: "user",
    });
    expect(input.rawObservationLines[1].amountYen).toBe(5);
  });
  it.each(["小計1005円", "税抜合計1005円", "10%対象1005円"])(
    "%s と税込合計の差額から独立した税額行なしで税額を確定する",
    (targetLabel) => {
      const input = unprovenTargetReceipt();
      input.amountYen = 1105;
      input.items = [{ ...input.items[0], printedAmountYen: 1005, amountBasis: "tax_excluded" }];
      input.rawObservationLines = [
        observationLine(targetLabel, 1005, 0),
        observationLine("合計1105円", 1105, 1),
      ];
      expect(allocated(input)).toBe(true);
      const first = reinterpretDraftTax(input);
      expect(first.interpretation.taxSummaries[0].taxYen).toBe(100);
      expect(first.itemFields[0].normalizedAmountYen).toBe(1105);
      expect(
        reinterpretDraftTax({ ...input, taxSummaries: first.interpretation.taxSummaries })
          .itemFields,
      ).toEqual(first.itemFields);
    },
  );
  it.each(["支払合計なし", "対象額不一致", "税額不読", "支払合計不一致"])(
    "税抜小計の差額推定は%sを解決しない",
    (problem) => {
      const input = unprovenTargetReceipt();
      input.amountYen = 1100;
      input.items = [{ ...input.items[0], printedAmountYen: 1000, amountBasis: "tax_excluded" }];
      input.rawObservationLines = [observationLine("10%対象1000円", 1000, 0)];
      if (problem !== "支払合計なし")
        input.rawObservationLines.push(observationLine("合計1100円", 1100, 1));
      if (problem === "対象額不一致") input.rawObservationLines[0].amountYen = 999;
      if (problem === "支払合計不一致") input.rawObservationLines[1].amountYen = 1101;
      if (problem === "税額不読")
        input.rawObservationLines.push({
          ...observationLine("消費税 読取不能", 0, 2),
          amountYen: null,
          amountText: null,
        });
      expect(allocated(input)).toBe(false);
    },
  );
  it.each(["消費税計", "消費税合計", "税額合計"])(
    "%s の明示税額訂正を税率付き税額訂正と同様に扱う",
    (label) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines![1].rawText = label + "437円";
      input.correctedTaxSummaries = [
        { ...input.taxSummaries[0], taxYen: 438, userEditedFields: ["taxYen"] },
      ];
      const first = reinterpretDraftTax(input);
      expect(allocated(input)).toBe(true);
      expect(first.interpretation.decision.taxAmount).toMatchObject({
        printedTaxYen: 437,
        userConfirmedTaxYen: 438,
        source: "user",
      });
      expect(
        reinterpretDraftTax({ ...input, taxSummaries: first.interpretation.taxSummaries })
          .itemFields,
      ).toEqual(first.itemFields);
      input.correctedTaxSummaries[0].taxYen = 999;
      expect(allocated(input)).toBe(false);
    },
  );
  it.each([false, true])(
    "混在税率の税合計は全税率訂正=%sの場合だけ訂正で置換する",
    (allCorrected) => {
      const input = unprovenTargetReceipt();
      input.amountYen = 2181;
      input.items = [
        { ...input.items[0], printedAmountYen: 1081, taxRatePercent: 8 },
        { ...input.items[0], printedAmountYen: 1100, taxRatePercent: 10 },
      ];
      input.rawObservationLines = [
        observationLine("合計2181円", 2181, 0),
        observationLine("内消費税8%80円", 80, 1),
        observationLine("内消費税10%100円", 100, 2),
        observationLine("消費税計180円", 180, 3),
      ];
      input.correctedTaxSummaries = [
        { ...input.taxSummaries[0], taxRatePercent: 8, taxYen: 81, userEditedFields: ["taxYen"] },
        ...(allCorrected
          ? [
              {
                ...input.taxSummaries[0],
                taxRatePercent: 10 as const,
                taxYen: 100,
                userEditedFields: ["taxYen" as const],
              },
            ]
          : []),
      ];
      expect(allocated(input)).toBe(allCorrected);
    },
  );
  for (const rate of [8, 10] as const) {
    for (const exemptBasis of ["tax_included", "tax_excluded"] as const) {
      it.each(["floor", "ceil"] as const)(
        `税抜${rate}%と${exemptBasis}の非課税商品は印字合計の差額%sで確定する`,
        (rounding) => {
          const input = unprovenTargetReceipt();
          const target = 1007;
          const tax =
            rounding === "floor"
              ? Math.floor((target * rate) / 100)
              : Math.ceil((target * rate) / 100);
          input.amountYen = target + 500 + tax;
          input.items = [
            {
              ...input.items[0],
              printedAmountYen: target,
              taxRatePercent: rate,
              amountBasis: "tax_excluded",
            },
            {
              ...input.items[0],
              printedAmountYen: 500,
              taxRatePercent: 0,
              amountBasis: exemptBasis,
            },
          ];
          input.taxSummaries = [];
          input.rawObservationLines = [
            observationLine(`${rate}%対象${target}円`, target, 0),
            observationLine("0%対象500円", 500, 1),
            observationLine(`合計${input.amountYen}円`, input.amountYen, 2),
          ];
          const first = reinterpretDraftTax(input);
          expect(first.itemFields.map((item) => item.allocatedTaxYen)).toEqual([tax, 0]);
          expect(first.itemFields.map((item) => item.taxAllocationStatus)).toEqual([
            "allocated",
            "allocated",
          ]);
          expect(first.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(
            input.amountYen,
          );
          expect(
            reinterpretDraftTax({ ...input, taxSummaries: first.interpretation.taxSummaries })
              .itemFields,
          ).toEqual(first.itemFields);
          input.rawObservationLines![0].amountYen = target - 1;
          expect(allocated(input)).toBe(false);
        },
      );
    }
  }
  it("非課税商品併存でも税率省略の税抜対象額と合計を照合する", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1600;
    input.items = [
      { ...input.items[0], printedAmountYen: 1000, amountBasis: "tax_excluded" },
      { ...input.items[0], printedAmountYen: 500, taxRatePercent: 0 },
    ];
    input.rawObservationLines = [
      observationLine("税抜対象1000円", 1000, 0),
      observationLine("合計1600円", 1600, 1),
    ];
    expect(allocated(input)).toBe(true);
    input.rawObservationLines.pop();
    expect(allocated(input)).toBe(false);
  });
  it("8%と10%の外税を非課税併存時にも支払合計だけで割り当てない", () => {
    const input = unprovenTargetReceipt();
    input.amountYen = 2680;
    input.items = [
      { ...input.items[0], printedAmountYen: 1000, amountBasis: "tax_excluded", taxRatePercent: 8 },
      {
        ...input.items[0],
        printedAmountYen: 1000,
        amountBasis: "tax_excluded",
        taxRatePercent: 10,
      },
      { ...input.items[0], printedAmountYen: 500, taxRatePercent: 0 },
    ];
    input.rawObservationLines = [
      observationLine("8%対象1000円", 1000, 0),
      observationLine("10%対象1000円", 1000, 1),
      observationLine("合計2680円", 2680, 2),
    ];
    expect(allocated(input)).toBe(false);
  });
  it.each([false, true])("非課税欄併存=%sでも率省略の対象額矛盾を捨てない", (hasExemptLine) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1600;
    input.items = [
      { ...input.items[0], printedAmountYen: 1000, amountBasis: "tax_excluded" },
      { ...input.items[0], printedAmountYen: 500, taxRatePercent: 0 },
    ];
    input.rawObservationLines = [
      observationLine("税抜対象1000円", 1000, 0),
      observationLine("合計1600円", 1600, 1),
      ...(hasExemptLine ? [observationLine("0%対象500円", 500, 2)] : []),
    ];
    expect(allocated(input)).toBe(true);
    input.rawObservationLines.push(observationLine("10%対象1000円", 1000, 3));
    input.rawObservationLines.push(observationLine("税抜対象999円", 999, 4));
    expect(allocated(input)).toBe(false);
  });
  it.each(["税額不読", "不正な非課税税額", "非課税対象額矛盾", "未知税率"])(
    "非課税併存の差額確定は%sを無視しない",
    (problem) => {
      const input = unprovenTargetReceipt();
      input.amountYen = 1600;
      input.items = [
        { ...input.items[0], printedAmountYen: 1000, amountBasis: "tax_excluded" },
        { ...input.items[0], printedAmountYen: 500, taxRatePercent: 0 },
      ];
      input.rawObservationLines = [
        observationLine("税抜対象1000円", 1000, 0),
        observationLine("合計1600円", 1600, 1),
        observationLine("0%対象500円", 500, 2),
      ];
      if (problem === "税額不読")
        input.rawObservationLines.push({
          ...observationLine("消費税 読取不能", 0, 3),
          amountYen: null,
          amountText: null,
        });
      if (problem === "不正な非課税税額")
        input.rawObservationLines.push(observationLine("0%消費税5円", 5, 3));
      if (problem === "非課税対象額矛盾") input.rawObservationLines[2].amountYen = 499;
      if (problem === "未知税率")
        input.rawObservationLines.push(observationLine("12%対象1000円", 1000, 3));
      expect(allocated(input)).toBe(false);
    },
  );
  it.each([
    "消費税等",
    "内消費税等",
    "消費税",
    "内消費税",
    "（内）消費税等",
    "税額",
    "内税",
    "消費税額",
    "消費税額等",
    "内税額",
    "内税計",
    "内消費税等計",
  ])("混在税率の率省略%sは税率別税額合計と照合する", (label) => {
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
      observationLine(label + "180円", 180, 3),
    ];
    const first = reinterpretDraftTax(input);
    expect(allocated(input)).toBe(true);
    expect(first.itemFields.map((item) => item.allocatedTaxYen)).toEqual([80, 100]);
    expect(
      reinterpretDraftTax({ ...input, taxSummaries: first.interpretation.taxSummaries }).itemFields,
    ).toEqual(first.itemFields);
    input.rawObservationLines[3] = observationLine(label + "181円", 181, 3);
    expect(allocated(input)).toBe(false);
    input.rawObservationLines[3] = {
      ...observationLine(label + "読取不能", 0, 3),
      amountYen: null,
      amountText: null,
    };
    expect(allocated(input)).toBe(false);
  });
  it.each(["外税", "外税額", "外消費税等", "（外）消費税等", "外消費税合計"])(
    "混在税率の率省略%sは商品の税込／税抜と矛盾しない場合だけ確定する",
    (label) => {
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
        observationLine(label + "180円", 180, 3),
      ];
      expect(allocated(input)).toBe(false);
      input.correctedTaxSummaries = [
        { ...input.taxSummaries[0], taxRatePercent: 8, taxYen: 80, userEditedFields: ["taxYen"] },
        { ...input.taxSummaries[0], taxRatePercent: 10, taxYen: 100, userEditedFields: ["taxYen"] },
      ];
      expect(allocated(input)).toBe(false);
      input.items = input.items.map((item) => ({
        ...item,
        printedAmountYen: 1000,
        amountBasis: "tax_excluded",
      }));
      expect(allocated(input)).toBe(true);
    },
  );
});
