# AFTERCARE

PR作成後のlatest HEADに対してCI・レビュー指摘・承認・競合・mergeabilityを確認し、merge_readyまで進める。

## 判断

- 外部findingは `node scripts/collect-pr-findings.mjs --pr <番号>` で収集し、仕様と照合して修正または根拠付きで棄却する。
- CI失敗（`needs:"ci_reproduce"`）は `--ci-failures <番号>` の `reproduce` コマンドでローカル再現を試し、結果を `--draft exit --event ci_failure` の下書きに記入して記録する。`not_reproduced`（ローカルで再現しない）は修復を推測せずINCIDENTへ。未解決recordはEXECUTEの `ready` を塞ぎ、修正push後は `--resolve-ci-failures` が検証を実走して解決扱いにする。
- E2Eのリトライはlocal/CIとも1回に統一。flakyを観測したらfollow-up Issueを起票する。
- owner approval等の人間承認が必要なら `decision_required`。pending・API取得失敗・required check未観測・HEAD変更はready扱いしない。判断が必要な状態のまま待機を繰り返さない。
- `--sync-pr` はcheckpointが変わる節目で行い、同一本文ならwriteを省略する。観測だけなら `--check-pr`（状態・本文を更新しない）。

## Exit

`node scripts/loop-runner.mjs --next` を実行する（`--sync-pr` → ready化 → watch → `ready` → `--publish-metrics` まで機械実行）。止まるのは `action_required`・`ci_reproduce`・`ci_pending`。詳細は `docs/agent-harness.md#prとaftercare`、遷移・上限は `docs/agent-harness-states.md`。
