const rawRows = `0|L0|null|null|unknown
1|L1|null|null|unknown
2|L2|null|null|unknown
3|L3|null|null|unknown
4|L4|null|null|unknown
5|L5|null|null|unknown
6|領収書|null|null|unknown
7|商品A　*164|164|164|item
8|商品B　*143|143|143|item
9|商品C　*137|137|137|item
10|商品D　*168|168|168|item
11|商品E　*168|168|168|item
12|小計（税抜 8%）　¥780|¥780|780|subtotal
13|消費税等（8%）　¥62|¥62|62|tax
14|合計　¥842|¥842|842|total
15|（税率8%対象　¥842）|¥842|842|subtotal
16|（内消費税等 8%　¥62）|¥62|62|tax
17|QUICPay支払　¥842|¥842|842|payment
18|お買上明細は上記のとおりです。|null|null|unknown
19|[*]マークは軽減税率対象です。|null|null|unknown
20|クレジット売上票（お客様控）|null|null|unknown
21|決済 ご利用日|null|null|payment`;
export const lines = rawRows.split("\n").map((row) => {
  const [i, rawText, amountText, amountYen, role] = row.split("|");
  return {
    sourceLineIndex: Number(i),
    rawText,
    amountText: amountText === "null" ? null : amountText,
    amountYen: amountYen === "null" ? null : Number(amountYen),
    lineRoleCandidates: [role],
    roleConfidence: 0.8,
    explicitlyPrinted: true,
  };
});
const clsRows = `0|ambiguous|unknown:0.4:ai_candidate:unknown
1|ambiguous|unknown:0.4:ai_candidate:unknown
2|ambiguous|unknown:0.4:ai_candidate:unknown
3|ambiguous|unknown:0.4:ai_candidate:unknown
4|ambiguous|unknown:0.4:ai_candidate:unknown
5|ambiguous|unknown:0.4:ai_candidate:unknown
6|ambiguous|unknown:0.4:ai_candidate:unknown
7|classified|item:0.75:ai_candidate:item
8|classified|item:0.75:ai_candidate:item
9|classified|item:0.73:ai_candidate:item
10|classified|item:0.74:ai_candidate:item
11|classified|item:0.74:ai_candidate:item
12|classified|subtotal:0.97:explicit_label:subtotal+ai_candidate:subtotal
13|classified|tax:0.83:ai_candidate:tax+position:receipt_footer+amount_relation:tax_summary
14|classified|totalCandidate:1:explicit_label:total+ai_candidate:total+position:receipt_footer+amount_relation:receipt_total;unknown:0.7:structural_context:footer_tax_amount_without_label
15|classified|tax:0.96:structural_label:taxable_amount+position:receipt_footer+amount_relation:tax_summary;subtotal:0.78:ai_candidate:subtotal+position:receipt_footer
16|classified|tax:0.83:ai_candidate:tax+position:receipt_footer+amount_relation:tax_summary
17|ambiguous|cashReceived:0.79:ai_candidate:payment+position:receipt_footer;paymentMethodAmount:0.79:ai_candidate:payment+position:receipt_footer;unknown:0.7:structural_context:footer_tax_amount_without_label
18|classified|totalCandidate:0.98:explicit_label:total+position:receipt_footer;unknown:0.4:ai_candidate:unknown
19|ambiguous|unknown:0.4:ai_candidate:unknown
20|classified|paymentMethodAmount:0.98:explicit_label:payment_method+position:receipt_footer;unknown:0.4:ai_candidate:unknown
21|ambiguous|cashReceived:0.75:ai_candidate:payment+position:receipt_footer;paymentMethodAmount:0.75:ai_candidate:payment+position:receipt_footer;unknown:0.4:classification_ambiguous`;
export const classifications = clsRows.split("\n").map((row) => {
  const [i, status, cands] = row.split("|");
  return {
    sourceLineIndex: Number(i),
    status,
    candidates: cands.split(";").map((c) => {
      const [role, score, ...ev] = c.split(":");
      return { role, score: Number(score), evidence: ev.join(":").split("+") };
    }),
  };
}) as any;

export const sourceTaxSummaries = [
  {
    reasons: ["included_mode_with_tax_excluded_basis", "tax_summary_amount_mismatch"],
    roundingMethod: "unknown",
    status: "contradictory",
    taxIncludedAmountYen: 842,
    taxMode: "included",
    taxRatePercent: 8,
    taxYen: 62,
    taxableAmountBasis: "tax_excluded",
    taxableAmountYen: 780,
    warnings: [],
  },
] as any;
const prices = [164, 143, 137, 168, 168];
export const mkItems = (basis: string) =>
  prices.map((p, i) => ({
    id: `i${i}`,
    itemName: `商品${i}`,
    amountYen: String(p),
    printedAmountYen: p,
    amountBasis: basis,
    taxRatePercent: 8,
    lineType: "item",
    markers: ["*"],
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
    taxConfirmedFields: ["amountBasis", "taxRatePercent"],
    warnings: [],
  })) as any;
