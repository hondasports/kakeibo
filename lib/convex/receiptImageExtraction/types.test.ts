import { describe, expectTypeOf, it } from "vitest";
import type {
  AmountBasis,
  ExtractedReceiptTaxSummary,
  ExtractReceiptFieldsResult,
  ExtractReceiptItemResult,
  ReceiptRawObservationLine,
  ReceiptItemTaxRatePercent,
  RoundingMethod,
  TaxMode,
  TaxRatePercent,
} from "./types";

describe("receipt extraction tax types", () => {
  it("税率と税属性を限定されたliteral unionで表現する", () => {
    expectTypeOf<TaxRatePercent>().toEqualTypeOf<0 | 8 | 10>();
    expectTypeOf<ReceiptItemTaxRatePercent>().toEqualTypeOf<TaxRatePercent | null>();
    expectTypeOf<AmountBasis>().toEqualTypeOf<"tax_included" | "tax_excluded" | "unknown">();
    expectTypeOf<TaxMode>().toEqualTypeOf<"external" | "included" | "mixed" | "unknown">();
    expectTypeOf<RoundingMethod>().toEqualTypeOf<"floor" | "round" | "ceil" | "unknown">();
  });

  it("抽出明細と税率別集計に税情報を保持できる", () => {
    expectTypeOf<ExtractReceiptFieldsResult["amountYen"]>().toEqualTypeOf<number | null>();
    expectTypeOf<ExtractReceiptFieldsResult["rawObservations"]>().toEqualTypeOf<
      ReceiptRawObservationLine[] | undefined
    >();
    expectTypeOf<ExtractReceiptItemResult["printedAmountYen"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<ExtractReceiptItemResult["amountBasis"]>().toEqualTypeOf<
      AmountBasis | undefined
    >();
    expectTypeOf<ExtractReceiptItemResult["taxRatePercent"]>().toEqualTypeOf<
      ReceiptItemTaxRatePercent | undefined
    >();
    expectTypeOf<ExtractReceiptItemResult["taxMarker"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ExtractReceiptItemResult["markers"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ExtractReceiptItemResult["quantity"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ExtractReceiptItemResult["unitPriceYen"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ExtractReceiptFieldsResult["taxSummaries"]>().toEqualTypeOf<
      ExtractedReceiptTaxSummary[] | undefined
    >();
  });
});
