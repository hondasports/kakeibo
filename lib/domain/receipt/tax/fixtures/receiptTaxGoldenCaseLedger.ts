import type {
  ReceiptLineClassification,
  ReceiptLineRole,
  ReceiptRawObservationLine,
} from "../../observations";
import type {
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  PriceTaxTreatment,
  ReceiptTaxDecisionSource,
  ReceiptTaxInput,
  TaxRateComposition,
  TaxSummaryDecisionStatus,
} from "../types";

/**
 * Issue #672 の台帳で使う失敗分類。
 * 実画像や店舗識別子はこの fixture に持ち込まず、利用できないケースは
 * `sourceAvailability: "unavailable"` として明示する。
 */
export const RECEIPT_TAX_GOLDEN_FAILURE_CLASSES = [
  "ocr_character_error",
  "semantic_misassignment",
  "self_consistent_wrong_values",
  "tax_label_misread",
  "mixed_tax_rates",
  "included_external_confusion",
  "total_candidate_confusion",
  "discount_or_payment_confusion",
  "persistence_or_registration",
] as const;

type ReceiptTaxGoldenFailureClass = (typeof RECEIPT_TAX_GOLDEN_FAILURE_CLASSES)[number];

type ReceiptTaxGoldenSourceAvailability = "approved_image" | "anonymized_lines" | "unavailable";

type ReceiptTaxGoldenFixtureOrigin = "survey_anonymized" | "synthetic" | "unavailable";

export const RECEIPT_TAX_GOLDEN_UNAVAILABLE_MISSING_EVIDENCE = [
  "approved_image_or_anonymized_lines",
  "human_reviewed_ground_truth",
  "failure_class",
  "line_role_candidates",
  "total_candidates",
  "registration_outcome",
] as const;

type ReceiptTaxGoldenObservationLine = {
  rawText: string;
  amountText?: string;
  amountYen?: number | null;
  sourceLineIndex: number;
  lineRoleCandidates: string[];
};

type ReceiptTaxGoldenTotalCandidate = {
  amountYen: number;
  sourceLineIndex: number;
  evidence: string[];
};

type ReceiptTaxGoldenExpected = {
  receiptTotalYen: number | null;
  priceTaxTreatment: PriceTaxTreatment;
  taxRateComposition: TaxRateComposition;
  resolutionStatus: TaxSummaryDecisionStatus;
  resolutionSource?: ReceiptTaxDecisionSource;
  registrationMode: "detailed" | "totalOnly" | "requiresUserConfirmation";
  registeredAmountYen: number | null;
  warningCodes: string[];
  excludedFromItems: number[];
};

export type ReceiptTaxGoldenCase = {
  id: string;
  sourceAvailability: ReceiptTaxGoldenSourceAvailability;
  fixtureOrigin: ReceiptTaxGoldenFixtureOrigin;
  failureClasses: ReceiptTaxGoldenFailureClass[];
  observations: {
    lines: ReceiptTaxGoldenObservationLine[];
    totalCandidates: ReceiptTaxGoldenTotalCandidate[];
  };
  expected: ReceiptTaxGoldenExpected;
  groundTruthReviewed: boolean;
  /** 決定的domain入力。実画像を直接読み込むことはない。 */
  input?: ReceiptTaxInput;
  /** R001のユーザー確認前を再現するための入力。 */
  preConfirmationInput?: ReceiptTaxInput;
  /** unavailableケースで不足している資料。 */
  missingEvidence?: string[];
  notes?: string;
};

function item(
  itemName: string,
  printedAmountYen: number,
  taxRatePercent: ExtractedReceiptItem["taxRatePercent"],
  amountBasis: ExtractedReceiptItem["amountBasis"],
  overrides: Partial<ExtractedReceiptItem> = {},
): ExtractedReceiptItem {
  return {
    itemName,
    printedAmountYen,
    taxRatePercent,
    amountBasis,
    markers: [],
    warnings: [],
    ...overrides,
  };
}

function summary(overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary {
  return {
    taxRatePercent: 10,
    taxMode: "included",
    taxableAmountYen: 100,
    taxableAmountBasis: "tax_included",
    taxYen: 10,
    taxIncludedAmountYen: 100,
    roundingMethod: "floor",
    confidence: {},
    warnings: [],
    ...overrides,
  };
}

function line(
  rawText: string,
  amountYen: number | null,
  lineRole: ReceiptLineRole,
  sourceLineIndex: number,
  overrides: Partial<ReceiptRawObservationLine> = {},
): ReceiptRawObservationLine {
  return {
    rawText,
    amountText: amountYen === null ? null : String(amountYen),
    amountYen,
    lineRoleCandidates: [lineRole],
    roleConfidence: 0.9,
    explicitlyPrinted: true,
    sourceLineIndex,
    ...overrides,
  };
}

function classification(
  sourceLineIndex: number,
  role: ReceiptLineClassification["candidates"][number]["role"],
  evidence: string[] = [],
): ReceiptLineClassification {
  return {
    sourceLineIndex,
    status: "classified",
    candidates: [{ role, score: 1, evidence }],
  };
}

function createCase(args: {
  id: string;
  sourceAvailability: Exclude<ReceiptTaxGoldenSourceAvailability, "unavailable">;
  fixtureOrigin: Exclude<ReceiptTaxGoldenFixtureOrigin, "unavailable">;
  failureClasses: ReceiptTaxGoldenFailureClass[];
  input: ReceiptTaxInput;
  expected: ReceiptTaxGoldenExpected;
  groundTruthReviewed: boolean;
  totalCandidates?: ReceiptTaxGoldenTotalCandidate[];
  preConfirmationInput?: ReceiptTaxInput;
  notes?: string;
}): ReceiptTaxGoldenCase {
  const observations = (args.input.rawObservationLines ?? []).map((observation) => ({
    rawText: observation.rawText,
    amountText: observation.amountText ?? undefined,
    amountYen: observation.amountYen,
    sourceLineIndex: observation.sourceLineIndex,
    lineRoleCandidates: [...observation.lineRoleCandidates],
  }));
  const totalCandidates =
    args.totalCandidates ??
    (args.input.rawObservationLines ?? [])
      .filter((observation) => observation.lineRoleCandidates.includes("total"))
      .flatMap((observation) =>
        observation.amountYen === null
          ? []
          : [
              {
                amountYen: observation.amountYen,
                sourceLineIndex: observation.sourceLineIndex,
                evidence: ["raw_total_candidate"],
              },
            ],
      );

  return {
    id: args.id,
    sourceAvailability: args.sourceAvailability,
    fixtureOrigin: args.fixtureOrigin,
    failureClasses: args.failureClasses,
    observations: {
      lines: observations,
      totalCandidates,
    },
    expected: args.expected,
    groundTruthReviewed: args.groundTruthReviewed,
    input: args.input,
    ...(args.preConfirmationInput === undefined
      ? {}
      : { preConfirmationInput: args.preConfirmationInput }),
    ...(args.notes === undefined ? {} : { notes: args.notes }),
  };
}

function unavailableCase(id: string): ReceiptTaxGoldenCase {
  return {
    id,
    sourceAvailability: "unavailable",
    fixtureOrigin: "unavailable",
    failureClasses: [],
    observations: { lines: [], totalCandidates: [] },
    expected: {
      receiptTotalYen: null,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["source_unavailable"],
      excludedFromItems: [],
    },
    groundTruthReviewed: false,
    missingEvidence: [...RECEIPT_TAX_GOLDEN_UNAVAILABLE_MISSING_EVIDENCE],
    notes: "調査元資料がこのリポジトリへ提供されていないため、推測でfixture化しない。",
  };
}

const r001PreConfirmationInput: ReceiptTaxInput = {
  amountYen: 803,
  receiptTotalSource: "ai_estimate",
  receiptTotalSupportingCandidates: [
    {
      amountYen: 7803,
      source: "explicit_label",
      evidence: "human_confirmed_total_candidate",
    },
  ],
  items: [item("商品A", 743, 8, "tax_excluded")],
  taxSummaries: [
    summary({
      taxRatePercent: 8,
      taxMode: "external",
      taxableAmountYen: 743,
      taxableAmountBasis: "tax_excluded",
      taxYen: 60,
      taxIncludedAmountYen: 7803,
    }),
  ],
  rawObservationLines: [
    line("商品A 743円", 743, "item", 1),
    line("消費税 60円", 60, "tax", 2),
    line("合計 803円", 803, "total", 3),
  ],
};

const r001Input: ReceiptTaxInput = {
  ...r001PreConfirmationInput,
  amountYen: 7803,
  receiptTotalSource: "user_confirmed",
  receiptTotalSupportingCandidates: [
    {
      amountYen: 803,
      source: "tax_arithmetic",
      evidence: "743 + 60 = 803",
    },
  ],
};

const availableCases: ReceiptTaxGoldenCase[] = [
  createCase({
    id: "R001",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "survey_anonymized",
    failureClasses: ["self_consistent_wrong_values", "total_candidate_confusion"],
    input: r001Input,
    preConfirmationInput: r001PreConfirmationInput,
    expected: {
      receiptTotalYen: 7803,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      resolutionStatus: "contradictory",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["normalized_amount_mismatch"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    totalCandidates: [
      {
        amountYen: 7803,
        sourceLineIndex: 3,
        evidence: ["human_confirmed_total_candidate"],
      },
      {
        amountYen: 803,
        sourceLineIndex: 3,
        evidence: ["743 + 60 = 803"],
      },
    ],
    notes: "ユーザー確認後の7803円を保護し、AIの803円へ戻さない。",
  }),
  createCase({
    id: "R002",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "survey_anonymized",
    failureClasses: ["tax_label_misread", "semantic_misassignment"],
    input: {
      amountYen: 500,
      items: [item("商品A", 500, null, "unknown")],
      taxSummaries: [],
      rawObservationLines: [
        line("商品A 500円", 500, "item", 1),
        line("税額候補 58円", 58, "tax", 2),
      ],
    },
    expected: {
      receiptTotalYen: 500,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: [
        "ambiguous_receipt_total",
        "unresolved_tax_rate:items[0]",
        "unresolved_amount_basis:items[0]",
      ],
      excludedFromItems: [2],
    },
    groundTruthReviewed: false,
    notes: "58円はtax/unknown候補として保持し、商品明細へ混入させない。",
  }),
  createCase({
    id: "R003",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "survey_anonymized",
    failureClasses: ["included_external_confusion", "mixed_tax_rates"],
    input: {
      amountYen: 320,
      items: [item("商品A", 100, 8, "tax_included"), item("商品B", 200, 10, "tax_excluded")],
      taxSummaries: [
        summary({
          taxRatePercent: 8,
          taxMode: "included",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_included",
          taxYen: 7,
          taxIncludedAmountYen: 100,
        }),
        summary({
          taxRatePercent: 10,
          taxMode: "external",
          taxableAmountYen: 200,
          taxableAmountBasis: "tax_excluded",
          taxYen: 20,
          taxIncludedAmountYen: 220,
        }),
      ],
      rawObservationLines: [
        line("商品A 100円", 100, "item", 1),
        line("商品B 200円", 200, "item", 2),
        line("軽減税率 8% 消費税額 7円", 7, "tax", 3),
        line("標準税率 10% 消費税額 20円", 20, "tax", 4),
        line("合計 320円", 320, "total", 5),
      ],
    },
    expected: {
      receiptTotalYen: 320,
      priceTaxTreatment: "perItem",
      taxRateComposition: "mixed",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["ambiguous_receipt_total"],
      excludedFromItems: [],
    },
    groundTruthReviewed: false,
    notes: "税込/税抜と8%/10%を別軸で保持し、基準額を単純加算しない。",
  }),
  createCase({
    id: "R004",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [],
    input: {
      amountYen: 110,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 110, 10, "tax_included")],
      taxSummaries: [summary({ taxableAmountYen: 110, taxIncludedAmountYen: 110 })],
      rawObservationLines: [
        line("商品A 税込 110円", 110, "item", 1),
        line("税込 10% 消費税額 10円", 10, "tax", 2),
        line("合計 110円", 110, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 110,
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 110,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R005",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [],
    input: {
      amountYen: 108,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, 8, "tax_excluded")],
      taxSummaries: [
        summary({
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          taxIncludedAmountYen: 108,
        }),
      ],
      rawObservationLines: [
        line("商品A 税抜 100円", 100, "item", 1),
        line("8% 消費税額 8円", 8, "tax", 2),
        line("合計 108円", 108, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 108,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 108,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R006",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [],
    input: {
      amountYen: 110,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, 10, "tax_excluded")],
      taxSummaries: [
        summary({
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 10,
          taxIncludedAmountYen: 110,
        }),
      ],
      rawObservationLines: [
        line("商品A 税抜 100円", 100, "item", 1),
        line("10% 消費税額 10円", 10, "tax", 2),
        line("合計 110円", 110, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 110,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 110,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R007",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["mixed_tax_rates"],
    input: {
      amountYen: 328,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, 8, "tax_excluded"), item("商品B", 200, 10, "tax_excluded")],
      taxSummaries: [
        summary({
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          taxIncludedAmountYen: 108,
        }),
        summary({
          taxRatePercent: 10,
          taxMode: "external",
          taxableAmountYen: 200,
          taxableAmountBasis: "tax_excluded",
          taxYen: 20,
          taxIncludedAmountYen: 220,
        }),
      ],
      rawObservationLines: [
        line("商品A 税抜 8% 100円", 100, "item", 1),
        line("商品B 税抜 10% 200円", 200, "item", 2),
        line("8% 消費税額 8円", 8, "tax", 3),
        line("10% 消費税額 20円", 20, "tax", 4),
        line("合計 328円", 328, "total", 5),
      ],
    },
    expected: {
      receiptTotalYen: 328,
      priceTaxTreatment: "excluded",
      taxRateComposition: "mixed",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 328,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R008",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["included_external_confusion", "mixed_tax_rates"],
    input: {
      amountYen: 320,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, 8, "tax_included"), item("商品B", 200, 10, "tax_excluded")],
      taxSummaries: [
        summary({
          taxRatePercent: 8,
          taxMode: "included",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_included",
          taxYen: 7,
          taxIncludedAmountYen: 100,
        }),
        summary({
          taxRatePercent: 10,
          taxMode: "external",
          taxableAmountYen: 200,
          taxableAmountBasis: "tax_excluded",
          taxYen: 20,
          taxIncludedAmountYen: 220,
        }),
      ],
      rawObservationLines: [
        line("商品A 税込 8% 100円", 100, "item", 1),
        line("商品B 税抜 10% 200円", 200, "item", 2),
        line("8% 消費税額 7円", 7, "tax", 3),
        line("10% 消費税額 20円", 20, "tax", 4),
        line("合計 320円", 320, "total", 5),
      ],
    },
    expected: {
      receiptTotalYen: 320,
      priceTaxTreatment: "perItem",
      taxRateComposition: "mixed",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 320,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R009",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [],
    input: {
      amountYen: 100,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, 0, "unknown")],
      taxSummaries: [],
      rawObservationLines: [
        line("非課税商品 100円", 100, "item", 1),
        line("合計 100円", 100, "total", 2),
      ],
    },
    expected: {
      receiptTotalYen: 100,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["unresolved_amount_basis:items[0]"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "非課税・税率0の表記だけで8%/10%や税込/税抜を推測しない。",
  }),
  createCase({
    id: "R010",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["included_external_confusion", "semantic_misassignment"],
    input: {
      amountYen: 220,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 200, 10, "tax_excluded")],
      taxSummaries: [
        summary({
          taxMode: "included",
          taxableAmountYen: 200,
          taxableAmountBasis: "tax_included",
          taxYen: 20,
          taxIncludedAmountYen: 220,
        }),
      ],
      rawObservationLines: [
        line("税抜小計 200円", 200, "subtotal", 1),
        line("消費税額 20円", 20, "tax", 2),
        line("税込合計 220円", 220, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 220,
      priceTaxTreatment: "perItem",
      taxRateComposition: "rate10",
      resolutionStatus: "contradictory",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["ambiguous_receipt_total", "normalized_amount_mismatch"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R011",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["tax_label_misread"],
    input: {
      amountYen: 100,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 100, null, "unknown")],
      taxSummaries: [],
      rawObservationLines: [
        line("商品A 100円", 100, "item", 1),
        line("税額 0円", 0, "tax", 2),
        line("合計 100円", 100, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 100,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["unresolved_tax_rate:items[0]", "unresolved_amount_basis:items[0]"],
      excludedFromItems: [2],
    },
    groundTruthReviewed: true,
    notes: "税額0円だけでは免税・非課税や税率を確定しない。",
  }),
  createCase({
    id: "R012",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["semantic_misassignment"],
    input: {
      amountYen: 100,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [],
      taxSummaries: [],
      rawObservationLines: [
        line("適格請求書発行事業者ではない", null, "unknown", 1),
        line("合計 100円", 100, "total", 2),
      ],
    },
    expected: {
      receiptTotalYen: 100,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["normalized_amount_mismatch"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "インボイス登録有無の文言だけで税額0や税込/税抜を確定しない。",
  }),
  createCase({
    id: "R013",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["discount_or_payment_confusion", "total_candidate_confusion"],
    input: {
      amountYen: 7803,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      receiptTotalSupportingCandidates: [
        {
          amountYen: 7803,
          source: "payment_change",
          evidence: "cash_received:10000 - change:2197",
        },
      ],
      items: [item("商品A", 7803, null, "unknown")],
      taxSummaries: [],
      rawObservationLines: [
        line("合計 7803円", 7803, "total", 1),
        line("現計 10000円", 10000, "payment", 2),
        line("釣銭 2197円", 2197, "change", 3),
      ],
      receiptLineClassifications: [classification(2, "cashReceived"), classification(3, "change")],
    },
    expected: {
      receiptTotalYen: 7803,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["unresolved_tax_rate:items[0]", "unresolved_amount_basis:items[0]"],
      excludedFromItems: [2, 3],
    },
    groundTruthReviewed: true,
    totalCandidates: [
      { amountYen: 7803, sourceLineIndex: 1, evidence: ["explicit_total"] },
      { amountYen: 7803, sourceLineIndex: 2, evidence: ["cash_received:10000 - change:2197"] },
    ],
  }),
  createCase({
    id: "R014",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["discount_or_payment_confusion"],
    input: {
      amountYen: 1500,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 1500, null, "unknown")],
      taxSummaries: [],
      rawObservationLines: [
        line("合計 1500円", 1500, "total", 1),
        line("電子マネー 1500円", 1500, "payment", 2),
      ],
      receiptLineClassifications: [classification(2, "paymentMethodAmount")],
    },
    expected: {
      receiptTotalYen: 1500,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "requiresUserConfirmation",
      registeredAmountYen: null,
      warningCodes: ["unresolved_tax_rate:items[0]", "unresolved_amount_basis:items[0]"],
      excludedFromItems: [2],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R015",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [
      "ocr_character_error",
      "total_candidate_confusion",
      "persistence_or_registration",
    ],
    input: {
      amountYen: 7803,
      receiptTotalSource: "user_confirmed",
      receiptTotalSupportingCandidates: [
        { amountYen: 803, source: "ai_estimate", evidence: "ocr_digit_drop:7803_to_803" },
      ],
      items: [],
      taxSummaries: [],
      rawObservationLines: [
        line("合計 7803円", 7803, "total", 1),
        line("AI候補 803円", 803, "total", 2),
      ],
    },
    expected: {
      receiptTotalYen: 7803,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "totalOnly",
      registeredAmountYen: 7803,
      warningCodes: ["normalized_amount_mismatch"],
      excludedFromItems: [2],
    },
    groundTruthReviewed: true,
    totalCandidates: [
      { amountYen: 7803, sourceLineIndex: 1, evidence: ["user_confirmed_total"] },
      { amountYen: 803, sourceLineIndex: 2, evidence: ["ocr_digit_drop:7803_to_803"] },
    ],
  }),
  createCase({
    id: "R016",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["discount_or_payment_confusion"],
    input: {
      amountYen: 900,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 900, 10, "tax_included")],
      taxSummaries: [summary({ taxableAmountYen: 900, taxYen: 82, taxIncludedAmountYen: 900 })],
      rawObservationLines: [
        line("商品A 税込 900円", 900, "item", 1),
        line("税込 10% 消費税額 82円", 82, "tax", 2),
        line("クーポン -10円", -10, "discount", 3),
        line("ポイント利用 -20円", -20, "payment", 4),
        line("袋代 30円", 30, "payment", 5),
        line("決済手段 900円", 900, "payment", 6),
      ],
      receiptLineClassifications: [
        classification(3, "coupon"),
        classification(4, "pointsUsed"),
        classification(5, "fee"),
        classification(6, "paymentMethodAmount"),
        classification(2, "tax"),
      ],
    },
    expected: {
      receiptTotalYen: 900,
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 900,
      warningCodes: [],
      excludedFromItems: [3, 4, 5, 6],
    },
    groundTruthReviewed: true,
  }),
  createCase({
    id: "R017",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: [],
    input: {
      amountYen: 35,
      receiptTotalSource: "explicit_label",
      receiptTotalConfidence: 0.99,
      items: [item("商品A", 33, 8, "tax_excluded")],
      taxSummaries: [
        summary({
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 33,
          taxableAmountBasis: "tax_excluded",
          taxYen: 2,
          taxIncludedAmountYen: 35,
          roundingMethod: "floor",
        }),
      ],
      rawObservationLines: [
        line("商品A 税抜 33円", 33, "item", 1),
        line("8% 消費税額 2円", 2, "tax", 2),
        line("合計 35円", 35, "total", 3),
      ],
    },
    expected: {
      receiptTotalYen: 35,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 35,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "端数処理floorを入力に固定し、同じ税額を再現する。",
  }),
  createCase({
    id: "R018",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["persistence_or_registration"],
    input: {
      amountYen: 5000,
      receiptTotalSource: "user_confirmed",
      items: [],
      taxSummaries: [],
      rawObservationLines: [line("合計 5000円", 5000, "total", 1)],
    },
    expected: {
      receiptTotalYen: 5000,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "totalOnly",
      registeredAmountYen: 5000,
      warningCodes: ["normalized_amount_mismatch"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "ユーザー確認済み合計だけをtotalOnly登録へ渡す代表ケース。",
  }),
  createCase({
    id: "R019",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["persistence_or_registration"],
    input: {
      amountYen: 1200,
      receiptTotalSource: "user_confirmed",
      items: [item("商品A", 1200, null, "unknown")],
      taxSummaries: [],
      rawObservationLines: [line("合計 1200円", 1200, "total", 1)],
    },
    expected: {
      receiptTotalYen: 1200,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      resolutionSource: "ai",
      registrationMode: "totalOnly",
      registeredAmountYen: 1200,
      warningCodes: ["unresolved_tax_rate:items[0]", "unresolved_amount_basis:items[0]"],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "旧形式下書きの税フィールド欠落をtotalOnlyへ安全に寄せる想定。",
  }),
  createCase({
    id: "R020",
    sourceAvailability: "anonymized_lines",
    fixtureOrigin: "synthetic",
    failureClasses: ["persistence_or_registration"],
    input: {
      amountYen: 110,
      receiptTotalSource: "user_confirmed",
      items: [item("商品A", 110, 10, "tax_included")],
      taxSummaries: [summary({ taxableAmountYen: 110, taxIncludedAmountYen: 110 })],
      rawObservationLines: [
        line("商品A 税込 110円", 110, "item", 1),
        line("税込 10% 消費税額 10円", 10, "tax", 2),
      ],
    },
    expected: {
      receiptTotalYen: 110,
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      registrationMode: "detailed",
      registeredAmountYen: 110,
      warningCodes: [],
      excludedFromItems: [],
    },
    groundTruthReviewed: true,
    notes: "登録失敗後の再試行でも、補正済みの税解釈を再利用する代表入力。",
  }),
];

const unavailableCases = Array.from({ length: 18 }, (_, index) =>
  unavailableCase(`R${String(index + 21).padStart(3, "0")}`),
);

/** R001〜R038の匿名台帳。unavailableケースは資料受領後に差分追加する。 */
export const receiptTaxGoldenCaseLedger: readonly ReceiptTaxGoldenCase[] = [
  ...availableCases,
  ...unavailableCases,
];
