export const RECEIPT_LINE_ROLES = [
  "item",
  "discount",
  "tax",
  "subtotal",
  "total",
  "payment",
  "change",
  "unknown",
] as const;

export type ReceiptLineRole = (typeof RECEIPT_LINE_ROLES)[number];

export type ReceiptObservationBoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ReceiptRawObservationLine = {
  rawText: string;
  amountText: string | null;
  amountYen: number | null;
  lineRoleCandidates: ReceiptLineRole[];
  roleConfidence: number;
  explicitlyPrinted: boolean;
  sourceLineIndex: number;
  boundingBox?: ReceiptObservationBoundingBox;
};

export type ReceiptRawObservation = {
  source: "ai_ocr" | "legacy_projection";
  observedAt: number;
  lines: ReceiptRawObservationLine[];
};

const AMOUNT_ONLY_TEXT = /^[¥￥]?(-?\d{1,3}(?:,\d{3})+|-?\d+)円?$/;

/** 金額だけが書かれた文字列（例: `￥4,810`）を円に変換する。金額以外が混じる文字列は読まない。 */
export function parseAmountOnlyText(amountText: string | null): number | null {
  if (amountText === null) return null;
  const match = AMOUNT_ONLY_TEXT.exec(amountText.normalize("NFKC").replace(/\s+/g, ""));
  if (match === null) return null;
  const amountYen = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(amountYen) ? amountYen : null;
}

/**
 * AIは読み切れない金額を `amountYen: null` で返すが、`amountText` に原文が残る場合がある。
 * 原文の金額が読めるなら、判定側で「読めない税の根拠」と見なさないよう数値を補う。
 * 保存済みの原文（rawObservation）自体は書き換えない。
 */
export function resolveObservationAmounts(
  lines: ReceiptRawObservationLine[] | undefined,
): ReceiptRawObservationLine[] | undefined {
  return lines?.map((line) =>
    line.amountYen === null ? { ...line, amountYen: parseAmountOnlyText(line.amountText) } : line,
  );
}

export const RECEIPT_STRUCTURAL_LINE_ROLES = [
  "item",
  "itemDiscount",
  "receiptDiscount",
  "coupon",
  "pointsUsed",
  "fee",
  "tax",
  "subtotal",
  "totalCandidate",
  "paymentMethodAmount",
  "cashReceived",
  "change",
  "unknown",
] as const;

export type ReceiptStructuralLineRole = (typeof RECEIPT_STRUCTURAL_LINE_ROLES)[number];

export type ReceiptLineClassificationCandidate = {
  role: ReceiptStructuralLineRole;
  score: number;
  evidence: string[];
};

export type ReceiptLineClassification = {
  sourceLineIndex: number;
  status: "classified" | "ambiguous";
  candidates: ReceiptLineClassificationCandidate[];
};
