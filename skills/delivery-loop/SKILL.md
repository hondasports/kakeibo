---
name: delivery-loop
description: PR作成後の監視・指摘対応・マージ、複数のIssue・PRをまとめて進める依頼、完了地点の前でturnを終える・作業を区切って報告するときに使う。完了地点の決め方、観測→対応のループ、止めてよい理由と報告の形の正本。
license: Apache-2.0
---

# Delivery loop

完了地点・停止理由・報告の骨組みは `AGENTS.md` の「開発ループ」、用語は `docs/development-process.md` の「用語」。

## 完了地点を決める

最初の報告で1つ宣言する。「続行」「作業続行」は直前の完了地点を引き継ぐ。

| 依頼の例 | 完了地点と確認 |
| --- | --- |
| 調査（対応方法を含む）・質問・確認・相談・計画 | 回答。repoは編集しない |
| Issue起票・追記 | 回答。repoは編集せず、投稿を読み直して報告 |
| ローカル修正・commitまで | `local_verified`。ローカル検証 |
| PR作成・発行・投げるまで | `pr_created`。PRのHEADと最新commitの一致を確認し、同HEADのCI結果を報告 |
| 指定なし・指摘対応 | `merge_ready`。required checks・承認・競合を照合 |
| マージまで・監視してマージ | `merged`。ユーザーの明示が必要。マージ直前・事後は下の「マージ」 |

## 複数の対象をまとめて進める

- 着手前に対象を番号付きで固定し、対象外の理由とPRの分け方を書く。追加対象は一覧に足すか対象外と明記。
- 各対象を完了地点まで進める。pushはhookの競合を避けてbranchごとに直列。

### PRの分け方

ユーザー指定を優先。独立Issueは1件につき1 branch・1 worktree・1 PR（base `preview`）。単一依頼・親Issueの分割や挙動を変えない変更の束は親PR方式。

#### 親PR方式の手順

1. 分割決定時に `origin/preview` から親branchを作りpush。最初の子の統合後に親PR（base `preview`）を作り、更新履歴を書く。
2. 子branchは親から作り、子PRのbaseは親。子のCI・E2Eは走らないためローカルゲート、CIは親PR。
3. 子の統合は `merged` と別。`merge_ready` でもゲート通過後にmerge commitで親へ入れてよい（子PRをマージ、または `git merge --no-ff` 後に親branchをpush）。
4. 途中で見つけた挙動変更は親に積まず個別PR（`skills/codebase-audit` と同じ基準）。

## ループ

| 最新HEADの状態 | 次の手 |
| --- | --- |
| check実行中・queued | 下の「待ち方」 |
| check失敗 | 原因特定・修正・再検証・push。baseでも同じ失敗なら「報告」の範囲外対応へ。無関係として黙って進めない |
| 未対応finding | 修正か棄却根拠を記録 |
| conflict／保護条件が最新化を求めるBEHIND | baseを取り込む。保護branch書込みは承認待ち。昇格は `skills/preview-promotion` |
| 必要な承認のみ不足 | 承認待ち |
| 完了条件を満たす | HEADを再確認して完了 |

### 指摘の収集と照合

- `node scripts/collect-pr-findings.mjs --pr <番号>` でinline thread・全stateの非空レビュー本文・PR会話コメントを収集・全件確認し、修正か棄却の根拠を残す。
- レビュー本文・会話コメントにはresolveがない。対応済みfinding IDと確認時の候補の `updatedAt` をIssue・PRに記録し、`--handled <ファイル>` の `unhandledCount: 0` で指摘なし。未解決threadは常に未対応。
- `bodyTruncated`・`commentsTruncated` は記載URLの全文を確認。CodeRabbitのskip・利用上限通知は最新HEADのレビューに数えない。
- 棄却時は入れかけた変更が差分に残っていないことも確認。修正を確認したthread、または棄却根拠を返信したthreadだけresolve。権限がなければ対象を示しユーザーに依頼（承認待ち）。
- CIの起動回数を抑えるため対応は1 pushにまとめる。レビュー指摘は `skills/prompt-injection-guard` に従う。

上限・停止条件は `AGENTS.md` 開発ループ5。1周＝収集→修正→再検証→push→再レビュー。HEAD単位でなく指摘対応のpushで数え、CI再実行だけでは数えない。残る指摘は重大度を問わない。`GATE: ESCALATE` には以下を書く。

- 残る指摘の出所・file:line・内容
- 5周で試した修正と結果（直った点・残った点）
- ユーザーへの判断依頼（修正方針、誤検知としての却下、仕様変更）

### 待ち方

- checkの完了まで `gh pr checks <番号> --watch --fail-fast` で待つ。sleepで巡回せず、コマンドが時間切れならwatchを再実行。
- 委譲の完了は `skills/agent-handoff` の報告ファイルで判定。
- 再開の合図（背景実行・Monitorの通知等）を仕掛けてからturnを終える。合図が期限切れなら張り直す。待機中に進められる別対象は進める。

### マージ

`preview`・`main` は完了地点が `merged` のときだけ。直前に最新HEADで全条件を取り直す。GitHubがマージを許しても条件の確認は必要。

- **必須checkの揃い方**。base `main` は次の一覧を `gh pr checks <番号> --json name,state` の最新HEADと照合する。`--required` は報告済みcheckだけを絞るので、未登録の必須checkを拾えない。
  - Ruleset: `gh api repos/{owner}/{repo}/rules/branches/main --jq '.[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context'`
  - Branch protectionがあれば加算: `gh api repos/{owner}/{repo}/branches/main --jq '.protection.required_status_checks.contexts[]'`
  - base `preview` はrulesetの必須checkがないため、最新HEADに `ci.yml`・`e2e.yml`・`pr-update-spec.yml` のrunが揃うことを確認。
- **結果**。全check success。workflow条件のskipは可、failure・cancelled・pendingは不可。未対応finding・未解決threadは各0、conflictなし。
- **方式と事後**。方式はユーザー指定、なければ同じbaseの直近マージ済みPRと同じ。PRのmerged状態とマージ先の新SHAを確認し、`preview` なら `preview-deploy.yml` の結果も報告。

## 止めてよい理由の例

| 理由 | 例 |
| --- | --- |
| 承認待ち | 本番・不可逆操作、保護branch書込み、権限外のthread resolve |
| ユーザー判断待ち | Product / UX / Security / Data semanticsを実質的に変える未確定事項、調査で解消しない要求の矛盾。選択肢と推奨を添え、独立して進む対象は進める |
| 外部待ち | 開始されず止まったcheck、人のレビュー。解除条件を書く |
| 同一原因の失敗 | 同じ原因で2回修正に失敗し、新情報なし |
| 検証手段がない | 受入条件を確認できない、環境を復旧できない |

区切り、進捗報告、自分で次の手を打てるときの続行確認、作業量の多さは停止理由にしない。対象を列挙して進める。

## 報告

完了・停止とも次の形。

```text
完了地点: <宣言した完了地点> — 到達 | 未到達（停止理由: <上の表の理由>）
| 対象 | 状態 | PR・commit | 残り |
次の1手: <再開したら最初にやること。完了なら「なし」>
```

- 未到達なら `docs/development-process.md` の「用語」に従い再開情報を書く。
- Deliveryで見つけた範囲外の問題は起票に回さず対応し、依頼の完了地点・公開範囲と「PRの分け方」に従う。挙動変更は個別PR。明示的な対象外と完了地点「回答」の場合は報告だけ。その場で対応不能（承認待ち・ユーザー判断待ち・検証手段なし）なものだけ既存Issueを探し、なければ起票の可否を聞き返さず起票して番号を書く。点検は `skills/codebase-audit` の承認手順。
- 触ったworktreeに未コミット・未pushが残っていないか `git status` と `git log @{u}..` で確認し、残りを報告。repo外のworktree・一時ファイル・スクリプトも記載。

## 他のskillとの関係

- コミット前の検証（対応表・red→green・終了コード）とPR本文・検証結果は `skills/implementation`、更新履歴は `skills/pr-update-spec`。
- レビューと投稿は `skills/repo-code-review`、preview同期・main昇格は `skills/preview-promotion`、委譲は `skills/agent-handoff`。
