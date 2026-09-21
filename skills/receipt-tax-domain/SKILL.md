---
name: receipt-tax-domain
description: レシートOCR・税額・税配分・下書き金額の正規化を変更・レビューするときに使う。
license: Apache-2.0
---

# レシート税ドメイン

## 構成

- 解釈: `lib/domain/receipt/tax/interpretReceiptTax.ts`（明細と税サマリ証拠から解釈）、`interpretReceiptTaxDecision.ts`（決定と理由）、`collectTaxEvidence.ts`
- 正規化・配分: `normalizeAmounts.ts`（`allocateTax`で按分）、`normalizeTaxSummaries.ts`、`reconcileTaxSummaries.ts`（複数サマリの完全一致照合）
- 下書き境界: `reinterpretDraftTax.ts`（保存・登録ガード・画面プレビューが共有する再解釈境界）、`draftTaxMapping.ts`
- 品質指標: `receiptTaxQualityMetrics.ts`、レポートは `pnpm receipt-tax:quality-metrics`

## 確認点

- 明細の `printedAmountYen`・`amountBasis`（unknownを含む）と税サマリの `taxMode`・`taxableAmountBasis` の対応関係を崩さない
- 税サマリが片方だけ確定（modeまたはbasisがunknown）でも補完するフォールバックは、表示・保存・登録で同一規則を維持する
- 按分は `allocateTax` を通す。算術的矛盾（印刷額合計と課税対象額の不一致等）は完全一致照合で `unallocated` のまま残し、誤確定しない
- 混在税率・割引・明細置換・片側欠損の負例を確認する
- 回帰資産: `receiptTaxInvariants.test.ts`（不変条件）、`receiptTaxGoldenCases.test.ts`（golden）、`receiptTaxCorruptionMatrix.test.ts`（破損パターン）、`ai-expense-queue.tax-regression.spec.ts`・`ai-expense-tax-allocation.spec.ts`（E2E）

変更時はinvariants系テストとgolden caseを更新し、品質指標が悪化していないか確認する。
