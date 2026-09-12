---
name: code-review
description: Suzumemo 差分レビュー。完了報告やpr_ready直前、明示依頼時に必須
---

# コードレビュー

レビューの深さは宣言ではなく、実際の差分に対するリスク判定で決める。判定はレビュー直前に実施し、結果を `review.json` の `risk_assessment` / `applied_tier` / `tier_rationale` に記録する。

## Step 0: リスク判定（必須・レビュー前）

1. 実差分を測定する: `git diff <base>...HEAD --stat`、変更ファイル、触れた層（presentation/usecase/domain/infra/他）、新規ファイル、共有callerへの影響。
2. 4軸を定性評価する（語彙の正本は `.loop/process.yaml` `review_depth`。`task-loop.mjs` `REVIEW_AXES` はそのミラーで、乖離はテストが検出する）:
   - `blast_radius`: `local` / `several_surfaces` / `shared_or_system_wide`
   - `data_security`: `none` / `indirect` / `direct_boundary_change`
   - `reversibility`: `easy` / `procedural_rollback` / `difficult_or_stateful`
   - `uncertainty`: `known_pattern` / `some_unknowns` / `novel_or_impact_unclear`
3. floor_triggers を点検する（`REVIEW_FLOOR_TRIGGERS` の語彙のみ使用可）:
   - `authentication_or_authorization` — 認証・認可境界
   - `schema_or_migration` — スキーマ・マイグレーション
   - `data_deletion_or_retention` — データ削除・保持
   - `complex_state_transition_or_orchestration_port` — 複雑な状態遷移・オーケストレーションの移植
   - `cross_domain_shared_caller_change` — ドメイン横断の共有caller変更
   - `external_service_write_or_webhook` — 外部write・webhook
   - `destructive_or_irreversible_operation` — 破壊的・不可逆操作
4. `applied_tier` を決める。CLI はフロアを強制する: floor_triggers が1つでもある、またはいずれかの軸が極端値（各リスト末尾）なら T3 未満は拒否される。いずれかの軸が中間値なら T2 未満は拒否される。宣言した tier が実際より浅いことに気づいたら、浅い記録を直すのではなく評価し直して正しい tier を記録する。

## ティア別の要求

- **T1**: 差分のスポットチェック + 全check成功。typo・docs・フォーマットのみ等。
- **T2**: 変更ファイルの行単位diffレビュー + エラー分岐の順序・互換exportの確認 + 関連テスト全成功。
- **T3**: T2 に加えて、ベース版との分岐単位突き合わせ（挙動保存系）またはロジック全トレース（変更系）、新設ポート/アダプタの意味論チェック（undefinedキー混入・不健全キャスト・往復変換）、全エラーパス、共有callerの実検証。

## レビュー本体

- 要件・契約・最新検証と差分を読み、漏れ・証拠不足・スコープ外挙動・caller不整合・拒否パス・永続化・関連境界を見る。
- 指摘は stable id で記録し、対処確認か根拠で閉じる。
- 再レビュー時は前回指摘の状態と新規差分だけでなく、変更が他項目へ与える影響も確認する。
- `source_comparison` / `diff_assessment` / `verification_assessment` / `manual_results` と判定結果を記録する。passは自己評価であって独立レビューではない。
- 内容・契約・環境が変わったら検証し直し、現在の差分へ再レビューする。再レビュー時はリスク判定もやり直す。
