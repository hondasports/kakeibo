# AFTERCARE

PR作成後のlatest HEADに対してCI・レビュー指摘・承認・競合・mergeabilityを確認し、merge_readyまで進める。

- REVIEWでdraft PRを作っている場合は、`--sync-pr <番号>` で状態ブロックを入れてから `gh pr ready <番号>` でready化する。`ready_for_review` で `Agent harness` とE2Eが実行される。draftのままではready扱いにならない。draft PRがなければここでPRを作る。

- `node scripts/collect-pr-findings.mjs --pr <番号>` で外部findingを収集し、仕様と照合して修正または根拠付きで棄却する。
- CI失敗は原因を調査して `ci_failure` でEXECUTEへ戻す。
- 新規findingは `findings` でEXECUTEへ戻す。
- owner approval等の人間承認が必要なら `decision_required` とする。
- pending、API取得失敗、required check未観測、HEAD変更はready扱いしない。
- CI待ちは `--aftercare <番号> --watch-aftercare` でpollできる。初回snapshotは `changed:false` のeventとして必ず返し、以後は状態変化時だけ差分event（変化した項目＋`added`/`removed`のpending/failed＋消えたキー名の `removedKeys`）を返す。結果の `watch.last` に最終snapshot全体を含む。変化なしのpollは出力なし。待たず即時確認が既定。
- 状態や本文を更新しない観測には `--check-pr <番号>` を使う。AFTERCARE/DONEで同じHEAD/base・検証・レビュー・最新CI・finding判定を適用し、taskの成功記録を書き換えない。待機は `--check-pr <番号> --watch-aftercare` に集約し、別のCI確認ループを重ねない。
- read-only監視で未処理指摘・未解決thread・新しい失敗・承認待ち・revision変更を検出したら `ready: false, reason: action_required` でAgentへ戻す。判断が必要な状態のまま待機を繰り返さない。
- `--sync-pr` はPR作成後・修正HEADのレビュー完了・状態遷移など復元用checkpointが変わる節目で行う。同一本文ならwriteを省略する。bot確認日時や待機snapshotの更新だけを人間向け本文へ書き戻さない。handled記録は別ファイルで管理し、別Sessionでは最新コメントを再取得・再確認して作り直す。
- DONE本文の同期でcheckやbotコメントが更新された場合は、`--check-pr` で現在の結果を確認する。観測結果をまた本文へ書く連鎖を作らない。新規の実指摘は通常どおりfindingsとして対応する。

必要条件を満たしHEAD不変を再確認できたら `ready`。
