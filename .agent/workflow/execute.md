# EXECUTE

Acceptance Criteriaを満たす最小差分を実装し、必要な検証が通るまで同じRun内で実装・テスト・debug・修正を反復する。

## 原則

- `scripts/assess-change.mjs` のMachine Floor、Required Skills、Verification Floorを最低条件として扱う。
- Agentは追加のSkill・検証・Risk引き上げを行えるが、最低条件を削らない。
- 変更後は影響するAcceptance Criteriaを未検証へ戻す。古いgreenをそのまま流用しない。
- 同一原因の失敗が上限に達したら `repeated_failure` を返し、無情報の再試行をしない。

## Exit

`loop-runner --verify` でHEADに紐づくprocess・必要なlint/unit/buildを記録する。ブラウザ受入条件がある場合は対象E2Eをlocal実行する。PR CI担当のE2Eはpendingとして残し、AFTERCAREで成功を必須とする。

実装とこの工程の要求検証が揃い、未解決blockerがなければ `ready`。仕様判断が必要なら `decision_required`。
