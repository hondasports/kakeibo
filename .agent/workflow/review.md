# REVIEW

実差分・Acceptance Criteria・検証結果を独立に確認し、Risk Floorを含むレビュー深度を満たす。`Final Risk = max(Predicted Risk Floor, Machine Diff Floor, Agent Assessment, Reviewer Assessment)` で、Machine Floorは引き下げ不可。

## 判断

- T1はセルフレビュー可。T2で `uncertainty=some_unknowns`、またはT3はfresh contextの独立Reviewer必須。実装担当の結論を先に見せず、目的・AC・差分・検証・関連caller/契約を渡して独立評価させる。
- severityの基準：blocker=AC未達・セキュリティやデータ破壊・本番障害、major=誤った挙動・回帰リスクのあるテスト欠落・契約違反、minor=可読性・保守性・軽微な不整合、nit=書式・命名の好み。severity記入は必須（未記入はmajor扱い）。
- cleanの条件は blocker / major のopen findingが0件。major以上は修正または根拠付き却下のみ。minor / nit は `status: deferred` + `followUp: <follow-up Issue URL>` で後回しできる（deferredは状態ブロックとPR本文に残る）。
- 各ラウンドで対象範囲を網羅し、見つけた指摘を一度に出す。後のラウンドへ小出しにしない。外部レビュー（CodeRabbit等）指摘の採否はReviewerが仕様と照合して判断し、findingsへ外部指摘を辿れるidで記録する。実装担当はReviewerの報告を編集しない。
- 共有契約や前提が変わった場合だけ増分レビューから全差分へ範囲を広げる。レビュー記録は修正commitの前に行う（記録→findings遷移→修正commitの順）。

## Exit

`node scripts/loop-runner.mjs --next` で外部指摘収集とpacket生成を行い `needs:"review"` で止まる。Reviewerの報告ファイルを受け取ったら `node scripts/loop-runner.mjs --next --review <file>` で残り検証・レビュー記録・clean判定（T2/T3は現在HEADのCI check評価を含む）を機械実行する。CI失敗の正規exitは `--event ci_failure --exit <file>`（aftercareと同じreproduction契約）。詳細は `docs/agent-harness.md#レビュー`、遷移・上限は `docs/agent-harness-states.md`。
