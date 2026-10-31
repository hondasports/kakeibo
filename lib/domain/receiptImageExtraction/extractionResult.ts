/**
 * レシート画像抽出の業務用結果契約の正本。
 * provider 応答の envelope（OpenAI Responses API 等）は adapter
 * （lib/convex/receiptImageExtraction）が所有し、ここには検証済みの抽出値だけを置く。
 * 税率・税属性・行種別・観測行・マーカー定義は lib/domain/receipt/** の正本を参照し、
 * 同じ型は複製しない。
 */
import type {
  TaxRatePercent,
  AmountBasis,
  TaxMode,
  RoundingMethod,
  ReceiptMarkerDefinition,
} from "../receipt/tax/types";
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type { ReceiptRawObservationLine } from "../receipt/observations";

export type {
  TaxRatePercent,
  AmountBasis,
  TaxMode,
  RoundingMethod,
  ReceiptMarkerDefinition,
} from "../receipt/tax/types";
export type { ReceiptItemLineType } from "../receipt/discountItems";
export type { ReceiptRawObservationLine } from "../receipt/observations";

export type ExtractionConfidence = {
  shopName: number;
  date: number;
  amountYen: number;
  documentType?: number;
  paymentPlace?: number;
  payeeName?: number;
  paymentPurpose?: number;
  categoryName?: number;
};

export type ReceiptItemTaxRatePercent = TaxRatePercent | null;

export type ExtractReceiptItemResult = {
  itemName: string;
  /** 明細の意味。旧応答との移行期間は optional。 */
  lineType?: ReceiptItemLineType;
  /** @deprecated 税対応の抽出結果では printedAmountYen を使用する。 */
  amountYen: number;
  /** #411/#412 の schema・parse 移行完了までは既存レスポンスとの互換用に optional。 */
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: ReceiptItemTaxRatePercent;
  markers?: string[];
  /** @deprecated markers を使用する。 */
  taxMarker?: string;
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  confidence: {
    itemName?: number;
    amountYen?: number;
    printedAmountYen?: number;
    amountBasis?: number;
    taxRatePercent?: number;
    categoryName?: number;
  };
  warnings: string[];
};

export type ExtractedTaxSummary = {
  taxRatePercent: TaxRatePercent;
  taxMode: TaxMode;
  taxableAmountYen: number;
  taxableAmountBasis: AmountBasis;
  taxYen: number;
  taxIncludedAmountYen?: number;
  roundingMethod: RoundingMethod;
  confidence: {
    taxRatePercent?: number;
    taxMode?: number;
    taxableAmountYen?: number;
    taxableAmountBasis?: number;
    taxYen?: number;
  };
  warnings: string[];
};

export type ExtractReceiptFieldsResult = {
  shopName: string;
  date: string;
  amountYen: number | null;
  documentType: "receipt" | "convenience_payment" | "unknown";
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  categoryName?: string;
  items?: ExtractReceiptItemResult[];
  taxSummaries?: ExtractedTaxSummary[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  rawObservations?: ReceiptRawObservationLine[];
  confidence: ExtractionConfidence;
  warnings: string[];
};

export type ExtractedFields = ExtractReceiptFieldsResult;
