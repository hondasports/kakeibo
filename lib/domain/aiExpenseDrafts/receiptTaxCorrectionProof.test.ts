import { expect, it } from "vitest";
import {
  resolveReceiptTaxCorrections,
  type ReceiptUserOverrideSnapshot,
} from "./receiptDataContract";
import { unprovenTargetReceipt } from "../receipt/tax/fixtures/unprovenTargetReceipt";

function candidate(tax = 438): ReceiptUserOverrideSnapshot {
  return {
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
      taxSummaries: [{ ...unprovenTargetReceipt().taxSummaries[0], taxYen: tax }],
    },
  };
}

it.each([
  "same",
  "target-only",
  "no-baseline",
  "duplicated",
  "generated",
  "generated-baseline",
  "global-choice",
])("%sの旧値を税額の明示訂正へ昇格しない", (kind) => {
  const override = candidate();
  const baseline = [{ ...override.values.taxSummaries![0] }];
  if (kind === "target-only") {
    baseline[0].taxYen = 437;
    override.values.taxSummaries![0].valueOrigin = {
      source: "user",
      previousTaxableAmountYen: 4373,
    };
  }
  if (kind === "duplicated") {
    baseline[0].taxYen = 437;
    baseline.push({ ...baseline[0] });
  }
  if (kind === "generated") {
    baseline[0].taxYen = 437;
    override.values.taxSummaries![0].valueOrigin = { source: "items" };
  }
  if (kind === "generated-baseline") {
    baseline[0].taxYen = 437;
    baseline[0].valueOrigin = { source: "items" };
  }
  if (kind === "global-choice") {
    baseline[0].taxYen = 437;
    override.fields.push("receiptTaxDecision");
  }
  const result = resolveReceiptTaxCorrections(
    override,
    kind === "no-baseline" ? undefined : baseline,
  );
  expect(result?.some((summary) => summary.userEditedFields?.includes("taxYen")) ?? false).toBe(
    false,
  );
});

it("一意な元snapshotから税額437→438の変更を証明できる旧訂正を保持する", () => {
  const override = candidate();
  const original = [{ ...override.values.taxSummaries![0], taxYen: 437 }];
  expect(resolveReceiptTaxCorrections(override, original)?.[0]).toMatchObject({
    taxYen: 438,
    userEditedFields: ["taxYen"],
  });
});

it("明示taxYen metadataは元snapshotがなくても訂正として保持する", () => {
  const override = candidate();
  override.values.taxSummaries![0].userEditedFields = ["taxYen"];
  expect(resolveReceiptTaxCorrections(override)?.[0].taxYen).toBe(438);
});
