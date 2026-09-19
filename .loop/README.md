# Astra Issue Loop v14

機械的な完了条件を維持し、CLIが現在の工程に必要な案内だけ返す。通常作業ではAGENTS.mdを入口にし、この文書とprocess.yamlの全文読込は不要。

## 操作

`node scripts/task-loop.mjs guide <topic>` はread-onlyで、その工程のスキル・入力例・判断材料を返す。topicはstart / contract / implementation / verification / assessment / review / delivery。案内されたスキルを適用し、読込済みなら再読しない。契約時・対象変更時はguide contractの条件付きスキルと対象技術の専門スキルを選ぶ。CLIはスキルの読込や適用自体を証明しない。

| コマンド（全て `node scripts/task-loop.mjs` に続ける） | 用途 |
| --- | --- |
| `init <id>` | 編集前preflightとタスク作成。専用worktree・非保護branch・clean baselineが必要 |
| `contract <id> <json> [更新理由]` | 目的・受入条件・維持条件・検証・環境・完了地点を登録。更新理由は必須 |
| `check <id> <check-id>` | 登録したargvを実行し、終了コード・時間・ログを自動記録 |
| `assess <id> <json>` | レビュー直前の実差分に対するリスク評価を記録。最低ティアを算出し、必要なレビュー内容を返す |
| `review <id> <json>` | 最新評価の深度で実施したセルフレビュー結果を登録 |
| `finding <id> <json>` | stable id / description / status / evidenceを持つ指摘を登録・更新 |
| `status <id>` | 不足条件と次の操作を返す。状態は変更しない。PR状態は観測しない |
| `finish <id> [PR-URL]` | 現在の証拠と契約の完了地点を検査 |

テンプレートは `.loop/templates/`。コピー先はignoredな `.loop/state/<id>/` とし、元テンプレートへタスク値を書かない。受入条件・維持条件・Controlには実行checkか具体的manual確認方法を持たせる。environmentは接続先・設定・fixture等の非秘密revisionとし、変更時に更新する。

checkは許可済みローカルコマンドだけ登録する。shellを使わないargvなので、Windowsではpnpm.cmdの代わりにnodeと実体JSパスを指定する。CLIはコマンドの安全性を判定しない。ログのsecret maskは完全ではなく、秘密を出力するコマンドを登録しない。

## レビュー深度

4軸と全floor triggerを維持する。Agentは未コミット・未追跡を含む実差分から評価と根拠を入力し、CLIがT1/T2/T3の最低深度を算出する。語彙は `guide assessment`、実行する確認内容は `assess` または `status` の出力を使う。詳細な規則はprocess.yaml。

深める場合のみassess入力のapplied_tierを指定する。最低未満は拒否する。review入力への評価・ティアの転記は不要で、上書きは拒否する。評価の取り直しは以前のレビューを失効させる。判定内容やレビュー実施の真偽はCLIで保証できず、passは独立レビューの証明ではない。

## 完了と保証

- 内容・契約・実行環境が変わればcheck・評価・レビューは全失効する。部分再利用はしない。check中にソース生成・整形が起きた場合も再確認が必要。ignoredな成果物は対象外。
- 未実行/失敗check、未解決事項、現在の評価・レビュー・manual証拠の不足、open findingは完了を拒否する。指摘は修正確認か不成立の根拠を記録して閉じる。
- local_verifiedはローカル検証、pr_createdは公開先と最新HEAD一致、merge_readyは最新PRのCI・承認・競合等まで。公開は許可範囲内でCLIの外から行う。finish自体はGitHubのread-only観測とローカル記録だけ。
- PR指摘の自動収集は未実装。merge_readyでは全指摘の確認をmanual Controlへ含める。未収集を「指摘なし」にしない。required checksと承認の正本はGitHub設定。
- 状態は単独writer・atomic更新のローカルJSON。改竄防止や外部環境の自動観測はない。tracked/stagedなタスク状態は拒否する。外側の品質条件はCIとbranch protectionが担う。

## v13からの移行と評価

v13状態の契約・指摘・履歴を保持して読み込み、次の書込みでversionを14へ更新する。証拠キーにLoop versionを含め、旧証拠は再利用しない。check → assess → reviewを実行し直す。旧review JSONのrisk_assessment / tier_rationale / applied_tierはassessment入力へ移し、manual_resultsはid / status / evidenceを使う。

改善の評価では、同じタスクで読込量・生成JSON量・ツール出力量・総トークン・時間と誤完了の有無を比較する。文書の文字数削減だけを総トークン削減率と呼ばない。不要な再試行、pending CI、古い証拠、指摘脱落を回帰確認する。Learningは反復失敗・明確な制御不足・ユーザー依頼時のみで、通常の完了条件にはしない。model/effortは実行環境の設定であり文書では変更できない。
