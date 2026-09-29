# AFTERCARE

PR作成後のlatest HEADに対してCI・レビュー指摘・承認・競合・mergeabilityを確認し、merge_readyまで進める。

- `node scripts/collect-pr-findings.mjs --pr <番号>` で外部findingを収集し、仕様と照合して修正または根拠付きで棄却する。
- CI失敗は原因を調査して `ci_failure` でEXECUTEへ戻す。
- 新規findingは `findings` でEXECUTEへ戻す。
- owner approval等の人間承認が必要なら `decision_required` とする。
- pending、API取得失敗、required check未観測、HEAD変更はready扱いしない。

必要条件を満たしHEAD不変を再確認できたら `ready`。
