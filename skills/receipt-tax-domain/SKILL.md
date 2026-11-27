---
name: receipt-tax-domain
description: レシートの税率判定・税額・税配分・下書き金額の正規化を変更・レビューするときに使う。対象パスは lib/domain/receipt/tax/**、ファイル名にtax/Taxを含むlib/**・src/**・e2e/**。税率判定ルールの正本、構成・不変条件・回帰資産。
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
- 登録額・税配分（`calculateReceiptRegistrationItems.ts`・`reinterpretDraftTax.ts`）を変えるときは、レビューの指摘が集中した次の組合せを固定ケースか生成で確かめる: 割引の金額基準（税込/税抜）と対象商品の基準の違い、対象付き・対象なし・別カテゴリの商品への割引、内税の端数処理（切り捨て・四捨五入・切り上げ）、合計行のラベル（「税込合計」等）と金額を読めない合計行
- 回帰資産: `receiptTaxInvariants.test.ts`（不変条件）、`receiptTaxGoldenCases.test.ts`（golden）、`receiptTaxCorruptionMatrix.test.ts`（破損パターン）、`ai-expense-queue.tax-regression.spec.ts`・`ai-expense-tax-allocation.spec.ts`（E2E）

## 税率判定ルール（正本）

この節は税率・税込/税抜区分の判定ルールの正本。`docs/technical-design.md`・レビュー観点・テスト設計から参照し、ここへ細かな規則を複写しない。実装を変えるときは現行挙動とこの節の差分を先に確認する。

### 証拠種別と優先順位

レシート全体の2軸（`priceTaxTreatment`・`taxRateComposition`）は、証拠 source を `user` → `explicitLabel` → `marker` → `position` → `reconciliation` → `ai` の順で評価する。`user` は無条件に優先する。それ以外では unknown でない値を持つ最上位 source を選ぶ。選択後も、同位または上位の source に異なる既知値があれば status を verified にせず、競合理由を残す。

- `user`: ユーザーが明示した全体設定・上書き。最優先。
- `explicitLabel`: 非税調整行・事業者属性行を除いた印字行の明示ラベル。税込/税抜文言と `8%`・`10%` の明示率を読む。
- `marker`: 税率マーカーの凡例から読める 8%/10%。レシート全体構成の証拠にはなるが、商品個別の税率はマーカー単独では確定しない。
- `position`: レシート footer の税行情報に付随する「軽減税率」「標準税率」の文脈。
- `reconciliation`: verified な税サマリ・明細・支払合計が完全一致したときの照合結果。
- `ai`: OCR/AI抽出値と算術的な税込/税抜推定。最下位の推定候補として扱う。

商品ごとの税コンテキストは次の順で一意な場合だけ確定する。

1. 商品自身に明示税率と既知の価格区分がある: `item_explicit`
2. 明示税率はあるが価格区分が unknown で、同率サマリが一意に basis を示す: `summary_reconciliation`
3. マーカー凡例の税率と、対象商品の印字額合計・サマリ対象額が一致する: `marker_reconciled`
4. 処理可能なサマリから同じ税率のサマリが複数あるものを除いた推定用サマリが1件だけで、未解決の各商品の税率・価格区分がそのサマリと矛盾せず、確定済みを含む全明細合計と対象額が一致する: `single_summary`
5. 未解決明細の部分集合がサマリ残額へ一意に対応する: `summary_reconciliation`
6. 未解決明細すべてが残り1件のサマリへ一意に対応する: `remaining_summary`

同率の税込・税抜サマリが併存するときは計算には使えても、未確定明細の価格区分を一意には示さない。部分集合が複数ある、複数サマリ候補が同じ商品へ競合する、対象額が0円、商品やサマリの税率・basisが矛盾する場合は確定しない。

### `taxRateComposition` の決め方

`taxRateComposition` は 8%・10% の既知率だけから決める。8%だけなら `rate8`、10%だけなら `rate10`、両方なら `mixed`、どちらもなければ `unknown`。null・0%・非課税・免税の表記は 8%/10% の構成判定へ入れない。

### `unknown`・確認対象のまま残す条件

- 軸の既知証拠がない場合は、その軸を `unknown` にする。選んだ source と同位または上位の source に unknown でない異なる値がある場合（`user` を選んだ場合を除く）も最上位 source の値は選ぶが、status は verified にしない。下位 source だけが異なる場合は競合として扱わない。
- サマリが contradictory、支払合計・明細・サマリの照合が不一致、印字税額行が矛盾する場合は `contradictory`。
- 片方または両方の軸が unknown、主要証拠（user/explicitLabel/marker/position/reconciliation）が両軸に不足、上の同位・上位 source の競合がある、推定税額の端数処理が unknown、未検証サマリに依存する場合は `ambiguous`。
- 商品の税率が null なら `unresolved_tax_rate`、価格区分が unknown なら `unresolved_amount_basis` を残す。一意な照合がない限り確定しない。
- サマリの `taxableAmountBasis` が unknown でも、`taxMode` が external/included ならそれぞれ税抜/税込へ補完する。両方不明なら unresolved のままにする。

### 推測しない負例

- マーカーは印字文字列と凡例の補助証拠。商品個別の税率・価格区分をマーカー単独で確定しない。
- 金額一致だけで商品税率・価格区分を確定しない。換算後の1円差も一致とは扱わない。
- 非課税・税率0の表記だけで 8%/10% や税込/税抜を推測しない。
- 税額0円だけでは免税・非課税や税率を確定しない。
- インボイス登録有無の文言だけで税額0や税込/税抜を確定しない。
- 調査元資料のない実レシートを推測で fixture 化しない。負例は golden case ledger の notes も参照する。

### ユーザー確認の保持と解除

- ユーザー確認・上書きは推定候補より優先する。保存だけで未確認商品を確認済みへ昇格しない。
- `taxConfirmedFields` は税率・表示価格のどちらをユーザーが確認したかだけを保持するmetadataで、金額を二重保存しない。片軸の確認をもう片軸へ波及させない。null税率・不明価格へ戻すと該当確認だけを除去する。同じ選択肢の選び直しでも、その軸の確認を保存する。
- `taxConfirmedFields` を持たない既存の確定済み商品は互換fallbackで確認済みとみなす（`getItemTaxConfirmedFields`）。明示配列がある場合は空配列も正として扱う。
- 商品名・実効行種別が変わった場合は税率確認だけを解除し、`item_identity_changed` を残す。表示価格の確認は保持し、税率を unresolved/unallocated へ戻す。原文や保存済み全体設定だけでは解除しない。変更後の明示税率選択で解除理由を消す。
- 非同期応答の待ち中に商品名・行種別が変わった場合は、その応答の税率選択を引き継がない。
- 商品別確認と全体税率が競合する保存は更新前に拒否する。

変更時はinvariants系テストとgolden caseを流し、契約が変わる箇所と足りない回帰ケースだけ期待値・ケースを更新する。品質指標が悪化していないかも確かめる。
