# Harness eval（golden set）

ハーネスを変更したときに「品質が落ちていないか」「軽くなったか」を、同じタスクで
ハーネス版どうしを比較して確認する仕組み（Issue #943）。

- `golden-set.json` … 過去のPRから作った代表タスク5件（g1〜g5）。`oracle` は採点専用で、Agentには見せない。
- `harness-paths.json` … 評価対象のハーネスを過去コミットへoverlayするファイル一覧。ハーネスファイルを追加・移動したIssueはこの一覧も更新する。
- `baseline/<harnessVersion>.jsonl` … 現行ハーネスの実績（1タスク1行。`taskId` はgolden id）。

## 計測の分担

evalは実際のPRを作らない。Agentは **REVIEW clean** に到達した時点で終了する。
終了時の要約は `node scripts/loop-metrics.mjs --task <id> --format summary-json --out <file>` で
ローカルのJSON Linesへ書き出し、`report` に渡す。

AFTERCAREとCIの指標（`ciFailures`、CIの待ち時間、「CIの失敗 → 再push」の回数）は
evalの範囲外であり、#942の `collect-harness-metrics.mjs` による実PRの集計で比較する。

## 実行手順

eval実行は手動で起動する（CIで常時実行しない）。`git push`・PR作成は一切行わない。

```sh
# 1. worktree生成（harnessをoverlayしたeval/<id>/<ts>ブランチが作られる）
node scripts/harness-eval.mjs prepare g2-ui-fix --dir ~/repos/kakeibo-eval-g2 --harness HEAD

# 2. 出力された --init コマンド1行で、Agentを通常どおり起動する（REVIEW cleanまで）

# 3. oracleで採点（結果をbaselineファイルへ追記）
node scripts/harness-eval.mjs grade g2-ui-fix --dir ~/repos/kakeibo-eval-g2 \
  --out eval/harness/baseline/$(node -e "import('./scripts/loop-metrics.mjs').then(m=>console.log(m.harnessVersion()))" 2>/dev/null).jsonl

# 4. metrics要約を同じbaselineファイルへ追記
node scripts/loop-metrics.mjs --task g2-ui-fix --format summary-json \
  --out eval/harness/baseline/<harnessVersion>.jsonl

# 5. 比較（ベースライン vs 改修版）
node scripts/harness-eval.mjs report --baseline eval/harness/baseline/<v1>.jsonl --candidate <v2>.jsonl

# 6. worktreeとローカルブランチを削除
node scripts/harness-eval.mjs cleanup g2-ui-fix --dir ~/repos/kakeibo-eval-g2
```

`prepare` の `--harness <ref>` は比較したいハーネスの版を指すgit ref（既定はHEAD）。
overlayのコミット（`eval: overlay harness <ref>`）がrunnerの差分起点になるため、
上書きしたハーネスのファイルは `assess-change` の差分に混ざらない。
