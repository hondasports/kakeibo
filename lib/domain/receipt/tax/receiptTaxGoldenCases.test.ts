import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import { receiptTaxBasisCases, receiptTaxBasisInput } from "./fixtures/receiptTaxBasisCases";
import {
  RECEIPT_TAX_GOLDEN_FAILURE_CLASSES,
  RECEIPT_TAX_GOLDEN_UNAVAILABLE_MISSING_EVIDENCE,
  receiptTaxGoldenCaseLedger,
  type ReceiptTaxGoldenCase,
} from "./fixtures/receiptTaxGoldenCaseLedger";

const availableCases = receiptTaxGoldenCaseLedger.filter(
  (
    testCase,
  ): testCase is ReceiptTaxGoldenCase & { input: NonNullable<ReceiptTaxGoldenCase["input"]> } =>
    testCase.sourceAvailability !== "unavailable" && testCase.input !== undefined,
);

describe("Issue #890 印字基準が異なるgolden cases", () => {
  it.each(receiptTaxBasisCases)(
    "税込対象額$paidYen 円と税抜明細の固定期待値を再現する",
    (testCase) => {
      const source = receiptTaxBasisInput(testCase);
      const result = interpretReceiptTax(source);
      expect(result.items.map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
      expect(result.items.map((item) => item.normalizedAmountYen)).toEqual(
        testCase.amounts.map((amount, index) => amount + testCase.allocations[index]),
      );
      expect(result.taxSummaries[0]).toMatchObject(source.taxSummaries[0]);
      expect(result.warnings).toEqual([]);
      expect(interpretReceiptTax(source)).toEqual(result);
    },
  );
});

describe("Issue #672 receipt tax golden case ledger", () => {
  it("匿名Case IDをR001〜R038で一意に管理する", () => {
    expect(receiptTaxGoldenCaseLedger).toHaveLength(38);
    expect(receiptTaxGoldenCaseLedger.map((testCase) => testCase.id)).toEqual(
      Array.from({ length: 38 }, (_, index) => `R${String(index + 1).padStart(3, "0")}`),
    );
    expect(new Set(receiptTaxGoldenCaseLedger.map((testCase) => testCase.id)).size).toBe(38);
  });

  it("必須の失敗分類と匿名化メタデータを保持する", () => {
    const observedClasses = new Set(availableCases.flatMap((testCase) => testCase.failureClasses));
    expect(observedClasses).toEqual(new Set(RECEIPT_TAX_GOLDEN_FAILURE_CLASSES));

    for (const testCase of receiptTaxGoldenCaseLedger) {
      expect(testCase.observations).toHaveProperty("lines");
      expect(testCase.observations).toHaveProperty("totalCandidates");
      expect(testCase.expected).toHaveProperty("warningCodes");
      expect(testCase.expected).toHaveProperty("excludedFromItems");
      if (testCase.sourceAvailability === "unavailable") {
        expect(testCase.input).toBeUndefined();
        expect(testCase.groundTruthReviewed).toBe(false);
        expect(testCase.observations).toEqual({ lines: [], totalCandidates: [] });
        expect(testCase.missingEvidence).toEqual([
          ...RECEIPT_TAX_GOLDEN_UNAVAILABLE_MISSING_EVIDENCE,
        ]);
        expect(testCase.expected.receiptTotalYen).toBeNull();
        expect(testCase.expected.registrationMode).toBe("requiresUserConfirmation");
        expect(testCase.expected.warningCodes).toEqual(["source_unavailable"]);
      } else {
        expect(testCase.input).toBeDefined();
      }
    }
  });

  it("画像・個人識別情報をfixtureへ持ち込まない", () => {
    const serialized = JSON.stringify(receiptTaxGoldenCaseLedger);
    expect(serialized).not.toMatch(/data:image|(?:\.jpe?g|\.png|\.webp)\b|file:\/\//i);
    expect(serialized).not.toMatch(
      /(?:imagePath|imageUrl|cardNumber|membershipNumber|transactionNumber|phoneNumber|address)/i,
    );
    expect(serialized).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    expect(serialized).not.toMatch(/\b(?:sk|pk|ghp|github_pat|xoxb|xoxp|eyJ)[A-Za-z0-9_-]{12,}\b/i);
    expect(serialized).not.toMatch(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~-]{12,}\b/i);
    expect(serialized).not.toMatch(/\b\d{13,19}\b/);
    expect(serialized).not.toMatch(/\b(?:\+81|0)\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}\b/);
  });

  it("観測行はdomain入力のraw observationsから再現可能に投影される", () => {
    for (const testCase of availableCases) {
      const inputLines = testCase.input.rawObservationLines ?? [];
      expect(testCase.observations.lines).toEqual(
        inputLines.map((line) => ({
          rawText: line.rawText,
          amountText: line.amountText ?? undefined,
          amountYen: line.amountYen,
          sourceLineIndex: line.sourceLineIndex,
          lineRoleCandidates: [...line.lineRoleCandidates],
        })),
      );
    }
  });

  it("支払総額候補の根拠と採否状態を台帳へ固定する", () => {
    for (const testCase of availableCases) {
      const result = interpretReceiptTax(testCase.input);
      for (const candidate of testCase.input.receiptTotalSupportingCandidates ?? []) {
        expect(testCase.observations.totalCandidates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              amountYen: candidate.amountYen,
              evidence: expect.arrayContaining([candidate.evidence]),
            }),
          ]),
        );
        expect(result.receiptTotalResolution.candidates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              amountYen: candidate.amountYen,
              source: candidate.source,
            }),
          ]),
        );
      }

      if (testCase.input.receiptTotalSource === "user_confirmed") {
        expect(result.receiptTotalResolution.status).toBe("verified");
      } else if (
        testCase.input.receiptTotalSource === "ai_estimate" ||
        !testCase.input.receiptTotalSource
      ) {
        expect(result.receiptTotalResolution.status).toBe("ambiguous");
      }
    }
  });

  it("利用可能なケースは外部AIなしで期待する税軸・状態を再現する", () => {
    for (const testCase of availableCases) {
      const result = interpretReceiptTax(testCase.input);
      const { expected } = testCase;

      expect(result.receiptTotalResolution.protectedAmountYen).toBe(expected.receiptTotalYen);
      expect(result.decision).toMatchObject({
        priceTaxTreatment: expected.priceTaxTreatment,
        taxRateComposition: expected.taxRateComposition,
        resolutionStatus: expected.resolutionStatus,
      });
      if (expected.resolutionSource !== undefined) {
        expect(result.decision.resolutionSource).toBe(expected.resolutionSource);
      }
      expect([...result.warnings].sort()).toEqual([...expected.warningCodes].sort());
      expect(result.items).toHaveLength(testCase.input.items.length);
      expect(result.items.map((item) => item.printedAmountYen)).toEqual(
        testCase.input.items.map((item) => item.printedAmountYen),
      );
      expect(result.items.map((item) => item.itemName)).toEqual(
        testCase.input.items.map((item) => item.itemName),
      );

      const observedLineIndexes = new Set(
        testCase.observations.lines.map((line) => line.sourceLineIndex),
      );
      for (const excludedLineIndex of expected.excludedFromItems) {
        expect(observedLineIndexes).toContain(excludedLineIndex);
        const excludedLine = testCase.observations.lines.find(
          (line) => line.sourceLineIndex === excludedLineIndex,
        );
        expect(excludedLine?.lineRoleCandidates).not.toContain("item");
        if (excludedLine) {
          const itemAmounts = result.items.map((item) => item.printedAmountYen);
          const itemWithExcludedLine = result.items.find(
            (item) =>
              excludedLine.amountYen !== null &&
              item.printedAmountYen === excludedLine.amountYen &&
              excludedLine.rawText.includes(item.itemName),
          );
          expect(itemWithExcludedLine).toBeUndefined();
          if (excludedLine.amountYen !== null) {
            const inputAmountCount = testCase.input.items.filter(
              (item) => item.printedAmountYen === excludedLine.amountYen,
            ).length;
            const resultAmountCount = itemAmounts.filter(
              (amount) => amount === excludedLine.amountYen,
            ).length;
            expect(resultAmountCount).toBeLessThanOrEqual(inputAmountCount);
          }
        }
      }
      if (expected.registrationMode === "requiresUserConfirmation") {
        expect(expected.registeredAmountYen).toBeNull();
      } else {
        expect(expected.registeredAmountYen).toBe(expected.receiptTotalYen);
      }
    }
  });

  it("同じ固定入力は同じ解釈を返す", () => {
    for (const testCase of availableCases) {
      const first = interpretReceiptTax(testCase.input);
      const second = interpretReceiptTax(testCase.input);
      expect(second).toEqual(first);
    }
  });

  it("R001は算術一致だけで確定せず、確認済み7803円を保護する", () => {
    const testCase = receiptTaxGoldenCaseLedger.find((candidate) => candidate.id === "R001");
    if (!testCase?.input || !testCase.preConfirmationInput) {
      throw new Error("R001 golden case is incomplete");
    }

    const beforeConfirmation = interpretReceiptTax(testCase.preConfirmationInput);
    expect(beforeConfirmation.receiptTotalResolution.status).toBe("ambiguous");
    expect(beforeConfirmation.receiptTotalResolution.protectedAmountYen).toBe(803);
    expect(beforeConfirmation.decision.resolutionStatus).not.toBe("verified");
    expect(beforeConfirmation.receiptTotalResolution.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountYen: 7803, source: "explicit_label" }),
        expect.objectContaining({ amountYen: 803, source: "tax_arithmetic" }),
      ]),
    );

    const afterConfirmation = interpretReceiptTax(testCase.input);
    expect(afterConfirmation.receiptTotalResolution).toMatchObject({
      status: "verified",
      protectedAmountYen: 7803,
    });
    expect(afterConfirmation.receiptTotalResolution.reasons).toContain(
      "user_confirmed_total_precedes_tax_candidates",
    );
    expect(afterConfirmation.receiptTotalResolution.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountYen: 7803, source: "user_confirmed" }),
        expect.objectContaining({ amountYen: 803, source: "tax_arithmetic" }),
      ]),
    );
  });

  it("R002の58円税額行を商品明細へ混入させない", () => {
    const testCase = receiptTaxGoldenCaseLedger.find((candidate) => candidate.id === "R002");
    if (!testCase?.input) {
      throw new Error("R002 golden case is incomplete");
    }

    const result = interpretReceiptTax(testCase.input);
    expect(result.decision.taxAmount).toMatchObject({
      printedTaxYen: 58,
      source: "printed",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.printedAmountYen).toBe(500);
    expect(result.items.some((item) => item.printedAmountYen === 58)).toBe(false);
  });

  it("R003は税込・税抜と税率別の金額を別軸で保持する", () => {
    const testCase = receiptTaxGoldenCaseLedger.find((candidate) => candidate.id === "R003");
    if (!testCase?.input) {
      throw new Error("R003 golden case is incomplete");
    }

    const result = interpretReceiptTax(testCase.input);
    expect(result.items.map((item) => item.normalizedAmountYen)).toEqual([100, 220]);
    expect(result.items.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(320);
    expect(result.items.some((item) => item.printedAmountYen === 7)).toBe(false);
    expect(result.items.some((item) => item.printedAmountYen === 20)).toBe(false);
  });

  it("登録モードの期待値は確認前の金額を登録額へ昇格させない", () => {
    for (const testCase of receiptTaxGoldenCaseLedger) {
      const { expected } = testCase;
      if (expected.registrationMode === "requiresUserConfirmation") {
        expect(expected.registeredAmountYen).toBeNull();
        continue;
      }
      expect(expected.receiptTotalYen).not.toBeNull();
      expect(expected.registeredAmountYen).toBe(expected.receiptTotalYen);
      if (expected.registrationMode === "totalOnly" && testCase.input) {
        expect(testCase.input.receiptTotalSource).toBe("user_confirmed");
      }
    }
  });
});
