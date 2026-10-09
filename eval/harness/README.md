# Harness eval（golden set）

ハーネスを変更したときに「品質が落ちていないか」「軽くなったか」を、同じタスクで
ハーネス版どうしを比較して確認する仕組み（Issue #943）。

- `golden-set.json` … 過去のPRから作った代表タスク5件（g1〜g5）。`oracle` は採点専用で、Agentには見せない。
- `harness-paths.json` … 評価対象のハーネスを過去コミットへoverlayするファイル一覧。ハーネスファイルを追加・移動したIssueはこの一覧も更新する。`prepare` はこの一覧を **`<ref>` 側から読む**（`git show <ref>:eval/harness/harness-paths.json`）ため、呼び出し側のcheckoutより新しいハーネスが独自の依存ファイルを連れてきても正しくoverlayされる。`<ref>` にファイルが無い場合のみ実行側の一覧へfallbackする。
- `baseline/<harnessVersion>.jsonl` … 現行ハーネスの実績（1タスク1行。`taskId` はgolden id）。

## 計測の分担

evalは実際のPRを作らない。Agentは **REVIEW clean** に到達した時点で終了する。
終了時の要約は `node scripts/loop-metrics.mjs --task <id> --format summary-json --out <file>` で
ローカルのJSON Linesへ書き出し、`report` に渡す。

AFTERCAREとCIの指標（`ciFailures`、CIの待ち時間、「CIの失敗 → 再push」の回数）は
evalの範囲外であり、#942の `collect-harness-metrics.mjs` による実PRの集計で比較する。

## トークン・モデル呼び出し数の計測

`--record-usage` の記録が無いroleの `tokens` / `modelCalls` は0ではなく `null`（未計測）になり、
`report` では「未計測」と表示して差分（delta）を出さない。DevinはtranscriptもトークンAPIも使えず未計測になるため、
トークン・モデル呼び出し数を比較するevalは **Claude CodeまたはCodex** で実行し、
実行後に `--record-usage <transcript.jsonl>` で記録する。

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

## Oracleの隔離と既知の制限

`prepare` はcanonical cloneのworktreeではなく、**`git clone --depth 1` した独立repoの
worktree**を作る。eval repoのobject dbにはbaseCommit＋overlayのオブジェクトしか無いため、
`git show <referenceCommit>` や `golden-set.json` の内容には `git` では到達できない
（remoteも外してある）。これはAC1「Agentに見せない」をspec除外だけでなくobject dbでも担保するため。

残存する既知の制限:

- Agentが `git remote add` して参照元repoのパスを知っていれば、自分でfetchしてoracleに
  到達できる（能動的な迂回は防げない）。spec nonGoalsに「履歴・object db・リモートで
  oracleを探さない」と明記し、比較evalでは両側が同じ露呈を持つため相対比較の有効性は残る。
- harness-paths.jsonのoverlayはファイル＋package.jsonの `npmScripts` のみで、
  `devDependencies` 等はbaseCommitのまま。ハーネス側に新しいruntime依存を追加する
  Issueでは、この一覧（あるいはoverlay対象のdeps）も合わせて見直す。現行5件のbaseCommitでは
  全harness依存が既に存在することを確認済み。
