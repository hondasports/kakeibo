import { interpretReceiptTax } from "./interpretReceiptTax";
import type { ReceiptTaxGoldenCase } from "./fixtures/receiptTaxGoldenCaseLedger";

type AvailableReceiptTaxGoldenCase = ReceiptTaxGoldenCase & {
  input: NonNullable<ReceiptTaxGoldenCase["input"]>;
};

type ReceiptTaxQualityMetric = {
  id: "OFF01" | "OFF02" | "OFF03" | "OFF04" | "OFF05" | "OFF06" | "OFF07";
  numerator: number;
  denominator: number;
  percentage: number | null;
};

type ReceiptTaxQualityMetrics = {
  totalCases: number;
  availableCases: number;
  unavailableCases: number;
  groundTruthReviewedCases: number;
  preConfirmationCases: number;
  metrics: ReceiptTaxQualityMetric[];
};

function isAvailableCase(
  testCase: ReceiptTaxGoldenCase,
): testCase is AvailableReceiptTaxGoldenCase {
  return testCase.sourceAvailability !== "unavailable" && testCase.input !== undefined;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function sameNumberList(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function excludedItemsStayExcluded(testCase: AvailableReceiptTaxGoldenCase): boolean {
  const result = interpretReceiptTax(testCase.input);
  const resultAmounts = result.items.map((item) => item.printedAmountYen);

  return testCase.expected.excludedFromItems.every((excludedLineIndex) => {
    const excludedLine = testCase.observations.lines.find(
      (line) => line.sourceLineIndex === excludedLineIndex,
    );
    if (excludedLine?.amountYen === null || excludedLine?.amountYen === undefined) {
      return true;
    }

    const inputAmountCount = testCase.input.items.filter(
      (item) => item.printedAmountYen === excludedLine.amountYen,
    ).length;
    const resultAmountCount = resultAmounts.filter(
      (amount) => amount === excludedLine.amountYen,
    ).length;
    return resultAmountCount <= inputAmountCount;
  });
}

function matchesExpectedInterpretation(testCase: AvailableReceiptTaxGoldenCase): boolean {
  const result = interpretReceiptTax(testCase.input);
  const { expected } = testCase;

  return (
    result.receiptTotalResolution.protectedAmountYen === expected.receiptTotalYen &&
    result.decision.priceTaxTreatment === expected.priceTaxTreatment &&
    result.decision.taxRateComposition === expected.taxRateComposition &&
    result.decision.resolutionStatus === expected.resolutionStatus &&
    (expected.resolutionSource === undefined ||
      result.decision.resolutionSource === expected.resolutionSource) &&
    sameNumberList(
      result.items.map((item) => item.printedAmountYen),
      testCase.input.items.map((item) => item.printedAmountYen),
    ) &&
    result.items.map((item) => item.itemName).join("\u0000") ===
      testCase.input.items.map((item) => item.itemName).join("\u0000") &&
    sorted(result.warnings).join("\u0000") === sorted(expected.warningCodes).join("\u0000") &&
    excludedItemsStayExcluded(testCase)
  );
}

function metric(
  id: ReceiptTaxQualityMetric["id"],
  numerator: number,
  denominator: number,
): ReceiptTaxQualityMetric {
  return { id, numerator, denominator, percentage: percentage(numerator, denominator) };
}

export function hasReceiptTaxQualityFailure(metrics: ReceiptTaxQualityMetrics): boolean {
  const deterministicMismatchMetric = metrics.metrics.find(
    (metricResult) => metricResult.id === "OFF07",
  );
  return deterministicMismatchMetric === undefined || deterministicMismatchMetric.numerator > 0;
}

export function buildReceiptTaxQualityMetrics(
  cases: readonly ReceiptTaxGoldenCase[],
): ReceiptTaxQualityMetrics {
  const availableCases = cases.filter(isAvailableCase);
  const reviewedCases = availableCases.filter((testCase) => testCase.groundTruthReviewed);
  const unavailableCases = cases.filter(
    (testCase) => testCase.sourceAvailability === "unavailable",
  );
  const deterministicMismatchCases = availableCases.filter(
    (testCase) => !matchesExpectedInterpretation(testCase),
  );

  return {
    totalCases: cases.length,
    availableCases: availableCases.length,
    unavailableCases: unavailableCases.length,
    groundTruthReviewedCases: reviewedCases.length,
    preConfirmationCases: reviewedCases.filter(
      (testCase) => testCase.preConfirmationInput !== undefined,
    ).length,
    metrics: [
      metric("OFF01", availableCases.length, cases.length),
      metric("OFF02", reviewedCases.length, availableCases.length),
      metric(
        "OFF03",
        reviewedCases.filter((testCase) => testCase.failureClasses.includes("ocr_character_error"))
          .length,
        reviewedCases.length,
      ),
      metric(
        "OFF04",
        reviewedCases.filter((testCase) =>
          testCase.failureClasses.includes("semantic_misassignment"),
        ).length,
        reviewedCases.length,
      ),
      metric(
        "OFF05",
        reviewedCases.filter((testCase) => testCase.expected.warningCodes.length > 0).length,
        reviewedCases.length,
      ),
      metric(
        "OFF06",
        reviewedCases.filter((testCase) => testCase.expected.registrationMode === "totalOnly")
          .length,
        reviewedCases.length,
      ),
      metric("OFF07", deterministicMismatchCases.length, availableCases.length),
    ],
  };
}

function formatMetric(metricResult: ReceiptTaxQualityMetric): string {
  const rate = metricResult.percentage === null ? "N/A" : `${metricResult.percentage.toFixed(1)}%`;
  return `${metricResult.id}: ${metricResult.numerator}/${metricResult.denominator} (${rate})`;
}

export function formatReceiptTaxQualityMetrics(
  metrics: ReceiptTaxQualityMetrics,
  revision: string,
): string {
  const status = hasReceiptTaxQualityFailure(metrics) ? "FAIL" : "PASS";
  return [
    `RECEIPT_TAX_QUALITY_METRICS status: ${status}`,
    `revision: ${revision}`,
    `total_cases: ${metrics.totalCases}`,
    `available_cases: ${metrics.availableCases}`,
    `unavailable_cases: ${metrics.unavailableCases}`,
    `ground_truth_reviewed_cases: ${metrics.groundTruthReviewedCases}`,
    `pre_confirmation_cases: ${metrics.preConfirmationCases}`,
    ...metrics.metrics.map(formatMetric),
  ].join("\n");
}
