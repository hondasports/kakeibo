import { expect, it } from "vitest";
import { reinterpretDraftTax, type ReinterpretDraftTaxInput } from "./reinterpretDraftTax";
import { observationLine, unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";
import { buildDraftRegistrationItems } from "../../aiExpenseDrafts/registrationItems";
import { hasReceiptTaxMetadata } from "./draftTaxMapping";

function guessed(): ReinterpretDraftTaxInput {
  const input = unprovenTargetReceipt();
  input.rawObservationLines = [];
  input.items = [
    {
      ...input.items[0],
      printedAmountYen: 4810,
      amountBasis: "tax_excluded",
      taxResolutionStatus: "unresolved",
      taxResolutionSource: "single_summary",
    },
  ];
  return input;
}

it.each(["item-basis", "item-rate", "global-basis", "global-rate"])(
  "%s片軸だけでは旧推定の他軸を確認済みにしない",
  (kind) => {
    const input = guessed();
    input.items[0].amountBasis = "tax_included";
    if (kind === "item-basis") input.override = { itemIndex: 0, amountBasis: "tax_included" };
    if (kind === "item-rate") input.override = { itemIndex: 0, taxRatePercent: 10 };
    if (kind === "global-basis") input.decisionOverride = { priceTaxTreatment: "included" };
    if (kind === "global-rate") input.decisionOverride = { taxRateComposition: "rate10" };
    const result = reinterpretDraftTax(input);
    expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
  },
);

it.each([false, true])("逆順=%sでも個別の2操作を保存状態へ引き継いで確定する", (reverse) => {
  let input = guessed();
  const overrides = [
    { itemIndex: 0, taxRatePercent: 10 } as const,
    { itemIndex: 0, amountBasis: "tax_included" } as const,
  ];
  if (reverse) overrides.reverse();
  for (const [index, override] of overrides.entries()) {
    const result = reinterpretDraftTax({ ...input, override });
    expect(result.itemFields[0].taxAllocationStatus).toBe(
      index === 1 ? "allocated" : "unallocated",
    );
    expect(result.itemFields[0].taxConfirmedFields).toHaveLength(index + 1);
    input = { ...input, items: [{ ...input.items[0], ...result.itemFields[0] }] };
    if (index === 0)
      expect(reinterpretDraftTax(input).itemFields[0].taxAllocationStatus).toBe("unallocated");
  }
  expect(reinterpretDraftTax(input).itemFields[0].normalizedAmountYen).toBe(4810);
});

it("同じ軸の反復で両軸を確認済みにしない", () => {
  let input = guessed();
  input.items[0].amountBasis = "tax_included";
  for (let i = 0; i < 3; i++) {
    const result = reinterpretDraftTax({
      ...input,
      override: { itemIndex: 0, amountBasis: "tax_included" },
    });
    expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
    expect(result.itemFields[0].taxConfirmedFields).toEqual(["amountBasis"]);
    input = { ...input, items: [{ ...input.items[0], ...result.itemFields[0] }] };
  }
});

it.each(["rate", "basis"])("%sを不明へ戻したらその確認だけを除去する", (axis) => {
  const input = guessed();
  input.items[0] = {
    ...input.items[0],
    amountBasis: "tax_included",
    taxConfirmedFields: ["amountBasis", "taxRatePercent"],
  };
  const override =
    axis === "rate"
      ? { itemIndex: 0, taxRatePercent: null }
      : { itemIndex: 0, amountBasis: "unknown" as const };
  const result = reinterpretDraftTax({ ...input, override });
  expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
  expect(result.itemFields[0].taxConfirmedFields).toEqual(
    axis === "rate" ? ["amountBasis"] : ["taxRatePercent"],
  );
});

it.each(["合計点数3点", "お買上点数3点", "合計数量3個", "合計3点", "Total items 3"])(
  "%sを支払額にしない",
  (label) => {
    for (const count of [null, 3]) {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push({
        ...observationLine(label, 3, 4),
        amountYen: count,
        amountText: null,
      });
      expect(
        reinterpretDraftTax(input).itemFields.every(
          (item) => item.taxAllocationStatus === "allocated",
        ),
      ).toBe(true);
    }
  },
);

it.each([null, 4800])("本物の合計が%sなら矛盾・不読を捨てない", (amount) => {
  const input = unprovenTargetReceipt();
  input.rawObservationLines![0].amountYen = amount;
  expect(
    reinterpretDraftTax(input).itemFields.some(
      (item) => item.taxAllocationStatus === "unallocated",
    ),
  ).toBe(true);
});

it("税なし商品なしOCR払込票は合計明細へ登録できる", () => {
  const draft = {
    sourceType: "image_upload",
    documentType: "convenience_payment",
    amountYen: 1100,
    categoryId: "c",
    paymentPlace: "支払先",
    rawObservation: {
      source: "ai_ocr",
      observedAt: 0,
      lines: [{ ...observationLine("ご請求額1100円", 1100, 0), lineRoleCandidates: ["total"] }],
    },
  } as const;
  expect(hasReceiptTaxMetadata(draft, [])).toBe(false);
  expect(buildDraftRegistrationItems(draft as never, [])[0].amountYen).toBe(1100);
});

it.each(["raw", "snapshot", "correction"])(
  "商品なしでも%s税情報があれば登録検証を省略しない",
  (kind) => {
    const input = unprovenTargetReceipt();
    const draft = {
      amountYen: 1100,
      categoryId: "c",
      taxSummaries: [],
      ...(kind === "raw"
        ? {
            rawObservation: {
              source: "ai_ocr",
              observedAt: 0,
              lines: [observationLine("内消費税10%100円", 100, 0)],
            },
          }
        : kind === "snapshot"
          ? { receiptInterpretation: { values: { taxSummaries: input.taxSummaries } } }
          : {
              receiptUserOverride: {
                source: "user",
                updatedAt: 0,
                fields: ["taxSummaries"],
                values: {
                  status: "needs_review",
                  documentType: "receipt",
                  confidence: {},
                  warnings: [],
                  reviewReasons: [],
                  items: [],
                  taxSummaries: [],
                },
              },
            }),
    };
    expect(hasReceiptTaxMetadata(draft, [])).toBe(true);
    expect(() => buildDraftRegistrationItems(draft as never, [])).toThrow(/未確定/);
  },
);

it.each(["合計（ポイント利用後）9999", "お支払合計（ポイント付与前）9999"])(
  "%sの支払矛盾を数量として捨てない",
  (label) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(observationLine(label, 9999, 5));
    expect(
      reinterpretDraftTax(input).itemFields.some(
        (item) => item.taxAllocationStatus === "unallocated",
      ),
    ).toBe(true);
  },
);
