# EXECUTE

Acceptance Criteriaを満たす最小差分を実装し、必要な検証が通るまで同じRun内で実装・テスト・debug・修正を反復する。

## 原則

- `scripts/assess-change.mjs` のMachine Floor、Required Skills、Verification Floorを最低条件として扱う。
- Agentは追加のSkill・検証・Risk引き上げを行えるが、最低条件を削らない。
- 変更後は影響するAcceptance Criteriaを未検証へ戻す。古いgreenをそのまま流用しない。
- 同一原因の失敗が上限に達したら `repeated_failure` を返し、無情報の再試行をしない。
- 影響範囲・重要な前提・不確実性・検証計画が変わった場合だけ `--assessment` を再提出し、Profileを再判定する。通常の修正・テスト実行・CI待ち・コミットでは再判定しない。自動選択は上位へだけ変更され、反復失敗を理由にmaxへ引き上げない。下位への変更はユーザー指定または根拠記録が必要。

## Exit

`loop-runner --verify` でHEADに紐づくprocess・必要なlint/unit/buildを記録する。ブラウザ受入条件がある場合は対象E2Eをlocal実行する。E2Eが必須と判定され、PR CIで確認する場合はpendingとして残し、AFTERCAREでpublic/authenticated両方の成功を要求する。文書・工程管理のみなど差分判定でE2E対象外となる変更には、このCI待ちを追加しない。実行対象の判定は `docs/development-process.md` の「PR CI E2Eの差分判定」に従う。

実装とこの工程の要求検証が揃い、未解決blockerがなければ `ready`。仕様判断が必要なら `decision_required`。
