# EXECUTE

Acceptance Criteriaを満たす最小差分を実装し、必要な検証が通るまで同じRun内で実装・テスト・debug・修正を反復する。

## 判断

- Machine Floor・Required Skills・Verification Floorは最低条件。上積みは可、削減は不可。
- 同じラウンドのopen findingはまとめて修正・まとめて再検証する。1件ずつの実装→検証往復をしない。
- 同一原因の修正前に、入力の入口・現在/旧形式・明示値/派生値・保存/復元の経路と負例を列挙し、対象ACと回帰ケースをまとめる。新しい入口だけを後追いで直し続けない。
- 変更後は影響するAcceptance Criteriaを未検証へ戻す。古いgreenをそのまま流用しない。同一原因の失敗が上限に達したら再試行しない。
- 影響範囲・重要な前提・不確実性・検証計画が変わった場合だけassessmentを再提出する。通常の修正・テスト実行・CI待ち・コミットでは再提出しない。Tierの引き上げに根拠は不要だが反復失敗を理由に上げず、下位への変更はユーザー指定または根拠記録が必要。

## Exit

`node scripts/loop-runner.mjs --next` を実行する（clean tree確認・verify:prepush・未解決ciFailure再確認・残り必須検証・ready・`spec.prAllowed` ならpush＋draft PR作成まで機械実行）。止まる場合は `needs`（`commit`・`verify:prepush`・`ci_reproduce`・`verify`・`pr_permission`）に従う。検証の内訳と迂回条件は `docs/agent-harness.md#実装と検証`、遷移・上限は `docs/agent-harness-states.md`。
