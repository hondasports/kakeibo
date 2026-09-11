## 概要

<!-- 何を変更したかを簡潔に記載してください。 -->

## 関連Issue

<!-- 例: Closes #123 -->

Closes #

## 変更内容

<!-- 主な変更点を箇条書きで記載してください。 -->

- 

## Issueとの差分

<!-- Issueの仕様・完了条件から変更した点がなければ「なし」と記載してください。 -->

なし

<!--
差分がある場合:
- 変更した内容:
- 理由:
- Issue側へ反映が必要か:
-->

## リスク

<!-- 実装内容を確認したうえで Low / Medium / High のいずれかを記載してください。 -->

Risk: 

影響範囲:

- [ ] UI
- [ ] API / Server
- [ ] DB / Schema / Migration
- [ ] 認証・認可
- [ ] 外部API / Webhook
- [ ] CI/CD / Deploy
- [ ] その他
- [ ] 影響なし

<!--
目安:
Low    : 文言、表示、局所的なUIなど
Medium : 既存API変更、複数画面、データ更新ロジックなど
High   : Schema migration、認証・認可、削除、Production workflow、決済など
-->

## 検証

### 実行した検証

<!-- 実際に実行したコマンド・テストと結果を記載してください。 -->

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] E2E（必要な場合）

結果:

<!-- 成功 / 失敗と、必要なら補足を記載してください。 -->

### 実行していない検証

<!-- なし、または実行していない理由を記載してください。必須検証を未実行のまま通過させるための欄ではありません。 -->

なし

## 更新履歴

<!--
preview 向けPRは、ユーザー向け更新履歴への掲載方針を必ず記入してください。
未記入・プレースホルダー・矛盾した指定は CI でエラーになります。

掲載する場合: publish: true にし、category を feature / improvement / fix / performance / stability から選び、
description にユーザー向けの原稿を記入してください(UI変更以外のバグ修正や処理改善も掲載対象です)。

掲載しない場合: publish: false にして category / description を削除し、reason に非掲載理由を記入してください。
-->

<!-- suzumemo-update:start -->
```yaml
publish: 
category: 
description: |
```
<!-- suzumemo-update:end -->

## UI変更

<!-- UI変更がない場合は「なし」。ある場合はBefore / Afterの画像や説明を記載してください。 -->

なし

## 運用への影響

- DB schema変更: なし
- Migration: なし
- 環境変数追加・変更: なし
- Secret追加・変更: なし
- 外部サービス設定変更: なし
- Deploy手順変更: なし

<!-- 変更がある項目は「あり」に変更し、必要な作業を追記してください。 -->

## 最終確認

- [ ] Issueの完了条件を満たしている
- [ ] Issueとの差分を記載した
- [ ] 必要な検証を実行した
- [ ] 意図しない変更が含まれていない
- [ ] 必要なドキュメントを更新した、または更新不要であることを確認した
