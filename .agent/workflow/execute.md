# EXECUTE

Acceptance Criteriaを満たす最小差分を実装し、必要な検証が通るまで同じRun内で実装・テスト・debug・修正を反復する。

## 原則

- `scripts/assess-change.mjs` のMachine Floor、Required Skills、Verification Floorを最低条件として扱う。
- Agentは追加のSkill・検証・Risk引き上げを行えるが、最低条件を削らない。
- 同じラウンドのopen findingはまとめて修正し、修正コミット後にまとめて再検証する。1件ずつの実装→検証往復をしない。
- 同一原因の修正前に、入力の入口・現在/旧形式・明示値/派生値・保存/復元の経路と負例を列挙し、対象ACと回帰ケースをまとめる。新しい入口だけを後追いで直し続けない。
- 必須検証は `--verify-required` で一括実行する。状態を更新するrunnerを同じworktreeで並行起動しない。途中失敗後は原因を修正し、成功済みの現在HEAD証跡を保持して再開する。
- 通常出力は要約と不足条件を使う。成功ログや全状態の読み戻しを繰り返さず、`--artifacts` の参照先から必要な証跡だけ確認する。
- 変更後は影響するAcceptance Criteriaを未検証へ戻す。古いgreenをそのまま流用しない。
- 同一原因の失敗が上限に達したら `repeated_failure` を返し、無情報の再試行をしない。
- 影響範囲・重要な前提・不確実性・検証計画が変わった場合だけ `--assessment` を再提出し、Profileを再判定する。通常の修正・テスト実行・CI待ち・コミットでは再判定しない。Machine分類が変わらないrevision変更では評価が自動で引き継がれる。分類が変わった場合は `missing` に `assessment` が出るので再提出する。自動選択は上位へだけ変更され、反復失敗を理由にmaxへ引き上げない。下位への変更はユーザー指定または根拠記録が必要。

## Exit

`loop-runner --verify-required` でHEADに紐づくprocess・必要なlint/unit/buildを記録する。unitはここでは差分関連（affected）で足り、full unitはREVIEW中にReviewerと並行して完了させる。ブラウザ受入条件がある場合は対象E2Eをlocal実行する。E2Eが必須と判定され、PR CIで確認する場合はpendingとして残し、AFTERCAREでpublic/authenticated両方の成功を要求する。文書・工程管理のみなど差分判定でE2E対象外となる変更には、このCI待ちを追加しない。実行対象の判定は `docs/development-process.md` の「PR CI E2Eの差分判定」に従う。

実装とこの工程の要求検証が揃い、未解決blockerがなければ `ready`。ユーザーがPR作業を許可したタスクで初めてREVIEWへ進む場合は、branchをpushしてdraft PRを作り、外部レビューを内部レビューと並行させる（状態ブロックはAFTERCAREで同期する）。仕様判断が必要なら `decision_required`。
