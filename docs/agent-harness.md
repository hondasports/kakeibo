# Agent Harness操作手順

現行CLIの操作手順と詳細仕様。起動時に読むのは「手順」節だけでよく、以後はrunner出力の `workflow`（現在Stateのworkflow）と `next` に従い、操作の詳細が必要な時だけ該当節を読む。State・遷移・上限値の正本一覧は [Agent Harness State仕様](agent-harness-states.md)（`.agent/process.yaml` から自動生成）。軽量化の設計正本は [Agent Harness設計](agent-harness-design.md)。

タスク強度はTier（T1〜T3）に一本化され、Profile機構は廃止した。thorough検証（lint/unit/build必須）はTierと評価軸から機械判定される：final tierがT3、またはagent/reviewer評価のuncertaintyがknown_pattern以外、またはblast_radiusがshared_or_system_wideの場合。`--profile` は後方互換のため受理されるが無視され、警告を1行出す。旧形式の状態ブロック（profile/selection記録あり）はそのまま読み込める。

## 手順

runnerの通常出力は `state`・`workflow`（現在Stateのworkflow）・`missing`・`next` を返すので、`workflow` を読み `next` を実行する。taskId・head/base・risk・verification・openFindings・aftercare も含まれ、spec・history・評価本文・ログ本文は含まれない。根拠は `--explain`、証跡manifestは `--artifacts`、状態スナップショットは `--status`、状態ブロックは `--export` / `--export-file` / `--sync-pr` のみ。

1. 専用worktreeで `node scripts/check-task-worktree.mjs --require-clean`。
2. `--draft spec [--issue <番号>]` でspec下書きを作り、TODOを埋めて `--init <spec.json> --task <id> --runtime codex|devin|claude-code --implementer <session>`。PR作成を許可するならspecに `"prAllowed": true` を入れる（未指定/falseならEXECUTE末尾で `needs:"pr_permission"` に止まる）。
3. REFINE: `--draft assessment` → TODOを埋めて `--assessment <file>` → `--next`（spec/assessment/TODOを機械検証してreadyへ。不足は `needs` に出る）。Machine由来の初期値（data_security・reversibility・applied_tier）は下げられない。
4. EXECUTE: 実装・commit → `--next`（clean tree → `verify:prepush`（marker無しのとき実行）→ 未解決ciFailureの再確認 → 残りの必須検証 → ready → `prAllowed===true`なら push＋draft PR作成 → REVIEWへ）。prepush失敗・dirty tree・再現しないCI失敗では `needs` に止まる。
5. REVIEW: `--next`（external findings収集＋packet生成、`needs:"review"` と独立レビュー要否を返す）→ reviewerへpacketを渡す → `--next --review <file>`（REVIEW cleanに必要な残り検証→レビュー記録→open finding 0ならclean、あればfindings遷移でreasonはfinding id一覧）。再レビューは条件を満たせばpacketが自動で増分になる。
6. AFTERCARE: `--next`（`--sync-pr` → `gh pr ready` → watch（ready待ち）→ ready遷移 → `--publish-metrics` まで機械実行。`action_required` / CI失敗は `needs:"ci_reproduce"` で止まり、再現コマンドを返す）。
7. 再開: 同じworktreeでは `--next`。別Sessionでは `--restore-pr <番号>`。
8. 計測: `--friction-note <text>`、`--record-usage <transcript.jsonl> [--usage-role reviewer]`、`node scripts/loop-metrics.mjs --task <id>`（`--format summary-json [--out <file>]` でPRコメントと同じ1レコードの要約。PRを作らないeval用途）。PR横断の集計は `node scripts/collect-harness-metrics.mjs --since <YYYY-MM-DD> [--state merged|all] [--format table]`。

`--next` は `{taskId, state, needs, steps, next}` の1個のJSONだけ返す。stepsには成功した機械stepの名前だけ入る。`needs` は次に人間/Agentが供給するもの: `spec|assessment|skills|decisions|implementation|commit|verify:prepush|ci_reproduce|ci_unexpected_skip|verify|pr_permission|review|reassessment|fix|aftercare|pr|action_required|ci_pending|resolution|approval|gate|metrics|usage`。`gate`/`metrics`/`usage` は機械stepが例外になった停止（`error` に末尾ログが入る）で、原因を直して `--next` を再実行する。`--next` が `decision_required`・`resolved`・human-gate-release・`ci_failure` イベントを発火することはない — 判断は常にAgent側で、個別コマンド（`--event findings --exit` 等）は下記の詳細仕様を参照。

提出JSONは `--draft <spec|assessment|review|exit>` で下書き（`<git-path>/agent-drafts/`）を作り、残った `TODO` だけ埋めて提出する。`TODO` が残っていると拒否され、該当するJSON Pointerが返る。必須キーは `requiredKeys(kind, context)`（`scripts/loop-schema.mjs`）がスキーマと検証関数から一元生成するので、下書きと検証はずれない。要点だけ列記する:

- spec: `predictedRisk` 必須、Human Requestは改変しない（`--draft spec --issue` が「やりたいこと」節を `humanRequest` へ入れる）
- assessment: `risk_assessment`（4軸）・`tier_rationale`。Machine由来の初期値より低い値は拒否される
- review: 独立レビューは `independent: true`・`context: "fresh"`、増分は `deltaFrom`。findingの `severity` は `blocker|major|minor|nit` で必須、`deferred` は minor|nit のみ
- exit: `--draft exit --event <event>` が該当eventの必須キー（`reason`・`approval`・`resolution`・`reassessment`・`reproduction`・`ciFailure`）だけ出力する

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。

## 開始と再開

1. 専用worktreeでclean baselineを確認する。
2. 作業仕様JSONをリポジトリ外（例: `/tmp/spec.json`）に作る。`node scripts/loop-runner.mjs --draft spec [--issue <番号>]` の下書きに残りの項目を記入する（`--issue` 指定時はIssue本文の「やりたいこと」節を `humanRequest` へそのまま写し、言及されたpathから `predictedRisk` の初期値を推定する）。必須フィールドは `.agent/schema/spec.schema.json` を参照。`predictedRisk` も必須。Human Requestを改変せずGoal/AC/Non-goals/Assumptions/Verification Strategyを整理する。
3. 次を実行し、現在のworkflowを読む。

```bash
node scripts/loop-runner.mjs --init /tmp/spec.json --task i123 --runtime codex --implementer session-123
```

Devinでは `--runtime devin`、Claude Codeでは `--runtime claude-code` を指定する。旧来のモデル指定オプションは互換のため受理されるが、何も記録・参照しない。

4. REFINEの評価を記録し、EXECUTEへ進む。`--draft assessment` の下書きにはMachine分類由来の初期値（data_security・reversibility・floor_triggers・applied_tier）が入り、残りの軸はTODOなので埋めて提出する。初期値より低い値は拒否される。

```bash
node scripts/loop-runner.mjs --draft assessment
node scripts/loop-runner.mjs --assessment /tmp/assessment.json
node scripts/loop-runner.mjs --event ready
```

base既定値は `origin/preview`。別baseは開始時に `--base` で指定する。作業状態はworktree固有のGitメタデータに保存する。通常の再開は引数なしで実行する。`--state` は保存済み状態との一致確認専用であり、状態を飛ばす指定ではない。

通常出力は要約だけを返す。taskId・state・workflow（現在Stateのworkflowパス）・head/base・risk・missing・verification・openFindings・aftercare・next を含み、spec・history・configuration・評価本文・ログ本文は含まない。不足要件の根拠が必要な場合だけ `--explain`、検証証跡のmanifestだけ `--artifacts`、状態スナップショットは `--status` で確認する。状態ブロック全体は `--export` / `--export-file <path>` / `--sync-pr` でのみ出力する。Runtime hooks向けの読み取り専用 `--hook-state` は `{state, next}` だけを返し（未initは `state: null`）、taskを更新しない。

仕様の修正はREFINEで `--spec /tmp/spec.json`。未決事項があれば `--event decision_required --exit /tmp/exit.json` で停止する。exit JSONは `--draft exit --event <event>` の下書きが必要キー（reason・approval・resolution・reassessment・reproduction・ciFailureの該当分）だけを出力するので、TODOを埋めて提出する。Human Gateの解除には `approval: {"source":"user","reference":"対象と操作を承認したユーザー指示の参照"}` が必要。承認記録はAgentの責任であり、このJSONだけで人間の本人性を証明するものではない。提出JSONの必須キーは `requiredKeys(kind, context)`（`scripts/loop-schema.mjs`）が schema.required と validator の条件キーから一元生成する正本であり、`--draft`・`readSubmission` のTODO検査・`validateTransition` のexit存在確認のすべてがこれを使う。

## `--next`（自動前進）

`node scripts/loop-runner.mjs --next [--review <file>]` は「現在StateのAgent作業は終わった」前提で、そのStateの機械的な残りstepと遷移をまとめて実行し、最初の判断必要箇所で止まる。出力は1個のJSON `{taskId, state, needs, steps, next}`。`steps` は成功した機械step名だけ（ログ本文は含めない）。途中失敗しても保存済みの成功stepは保持されるので、原因を直して `--next` を再実行すれば途中から再開する。

各Stateで実行するstepと停止条件:

| State | 実行する機械step | 止まる `needs` |
|---|---|---|
| refine | spec・assessment（#948のTODO検出を含む）の検証 → `ready` | spec不足:`spec` / assessment不足:`assessment` / 必須skill未読:`skills` / material decision:`decisions` → 通過後 `implementation` |
| execute | clean tree確認 → `verify:prepush`（現在HEADの成功マーカーがなければ）→ 未解決ciFailureの再確認（`--resolve-ci-failures`相当、`--include`対象化付き）→ 残り必須検証 → `ready` → `spec.prAllowed===true` なら push＋draft PR作成 → REVIEWでpacket生成 | dirty tree:`commit` / prepush失敗:`verify:prepush`（失敗check名と再実行コマンドを返す）/ CI失敗未解決:`ci_reproduce` / 検証失敗:`verify` / prAllowed false:`pr_permission` / 同一原因の反復失敗が上限に達すればrecordFailure経由でINCIDENT |
| review（--reviewなし） | PRがあれば外部指摘を収集 → `--review-packet`（増分条件は既存ロジック） | 常に `needs:"review"`（packetパスと独立レビュー要否を返す） |
| review（--review file） | REVIEW cleanに必要な残り検証（全Tierともローカルはprocessのみ）→ レビュー記録 → open finding 0なら、T2/T3はdraft PRの現在HEADのCI checkを評価して `clean`（T1は従来どおり）、あれば `findings`（reasonはfinding id一覧） | 検証失敗:`verify` / 再評価必須回:`reassessment` / findings後:`fix` / CI待ち:`ci_pending` / CI失敗:`ci_reproduce`（exitは `--event ci_failure --exit`、aftercareと同じreproduction契約でEXECUTEへ）/ 意図しないSKIPPED:`ci_unexpected_skip` / clean後:`aftercare` |
| aftercare | `--sync-pr` → draftなら `gh pr ready` → `--aftercare --watch-aftercare` → `ready` → `--publish-metrics` | `action_required`（未処理指摘・thread・承認待ち・revision変更）/ CI失敗:`ci_reproduce`（`ciFailure{failedTests,traceUrl,reproduce}`）/ pending:`ci_pending` / PR無し:`pr` |
| incident / human_gate | 何もしない | `resolution` / `approval` |
| done | 何もしない | `needs:null`（`done:true`） |

機械stepが例外を投げた場合は素のエラーではなく `needs:"gate"`（遷移ゲート）・`"metrics"`（metrics投稿）・`"usage"`（引数不正）等で `{error}` を返し、原因を直して `--next` を再実行する。`--next --review` はreview state以外では `needs:"usage"` で拒否される。

`spec.prAllowed`（boolean、省略時false）はEXECUTE末尾のpush・draft PR作成の許可ゲート。falseなら遷移後に `needs:"pr_permission"` で止まり、リモートへの書き込みは一切行わない。

`--next --review <file>` でレビュー提出を兼ねるとき、`--review` は単独アクションとしては数えない（`--next` への入力）。`--handled <file>`（外部指摘の処理済み記録）と `--interval-seconds`（watch間隔）はそのまま渡せる。

## 実装と検証

変更後に実差分を評価し、必要Skillを読んで記録する。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json --skills workspace-preflight,security-review
```

assessmentは `scripts/review-depth.mjs` のrisk_assessment・tier_rationale・applied_tier形式。再提出は影響範囲・不確実性・検証計画の変化を示す場合だけ行う。通常の修正・テスト実行・CI待ち・コミットでは再提出しない。

HEAD/baseが変わると評価は原則失効するが、新revisionのMachine分類（machine floor・floor trigger・required skills・runtimeRelevant・必須検証kind）が直前の評価時と同一なら、Agent評価とskills記録を引き継ぎ、historyとmetricsに `assessmentCarried: true` を残す。分類が1つでも変わった場合は従来どおり `--assessment` の再提出を求める。引き継ぎは機械分類の不変性だけを根拠とするため、Agentが変更の性質や影響範囲の変化を認識した場合は分類が同じでも再提出する。REFINEへ戻ったタスクには引き継がない。runnerはGitの実差分を取得し、Spec予測・Machine・Agent・Reviewer・過去の最高Riskを統合する。診断CLIの `--paths` はrunner/CIの評価を差し替えられない。Machine Floorはパスルールに加えてhunkの中身（追加・削除行）でも判定する。`convex/**`・`src/**` の非テスト `.ts`/`.tsx` で、認証・認可（`getUserIdentity`/`ctx.auth`/`assert*Member|Owner|Admin`/`role === "owner|member"` 等）、削除・retention（`ctx.db.delete`、convex内の `.delete(`、`scheduler.run(After|At)`+delete）、schema/migration（`defineTable`/`defineSchema`/`.index(`）、外部write/webhook（convex内の `fetch(`、`httpAction`、`Resend`、`api.line.me`）を含む変更行は対応するtriggerを `source: "content"` で発火する。コメント・文字列リテラルの変更でも発火する（過検知許容）。hunkの読み取りはcontent rule対象のpathを含む変更でのみ行い、その取得に失敗した場合はfail-closedでT3（`diff_read_failed`。非コードのみの変更では読み取り自体を行わない）。`suggest-skills.mjs` も同じcontent判定で `security-review` を推奨する（`diff_read_failed` 単体では推奨しない）。`machine-risk.mjs` のCLI既定出力は `{triggerCount, floorTriggers, minimumTier}` で、`--detail` 付きなら `floorTriggerDetails`（`{trigger, source, path}`）を含むfull結果を返す。`assess-change.mjs` に `--paths` だけ渡した場合はhunkを読まずcontent ruleを評価しない（warningを出力する。gateに使う場合は `--base` を指定する）。

変更をcommitしてから検証する。pre-commitは初期化済みEXECUTE状態を要求する。

```bash
node scripts/loop-runner.mjs --verify-required
node scripts/loop-runner.mjs --event ready
```

必要な検証のみ実行する。固定コマンドをCLIが起動し、終了結果を現在HEAD/baseへ紐づける。processはドキュメント整合とprocessテスト、lintはlintとformat、unitはVitest全体からprocess suite（`test:process` のファイル）を除いたもの、buildは本番ビルド。processは全変更で必須なので、process suiteのファイルをunitで二重に実行しない。`test:process` が `vitest run <files>` 形式で読めない場合は除外せず全体を実行する。CIのTestは常に全件を実行する。dirty treeでは証跡を確定しない。

`--verify-required` は現在の評価で必須のlocal検証を直列実行し、成功したkindごとに証跡を保存する。現在HEAD/baseで成功済みのkindは省略し、最初の失敗で停止する。E2Eは従来どおりGitHubのdelivery gateとなる。修正・再開時にHEAD/baseが変われば通常の失効判定を適用する。単独kindの `--verify <kind>` も利用できる。状態ファイルを更新するrunnerを同じworktreeで並行起動しない。

#952以降、ローカルの必須検証は全Tierとも `process` のみ（`requiredVerificationKinds`）。lint/unit/buildの合否はCIのcheckを正本とし、push前は `verify:prepush` の成功マーカー（`pnpm verify:prepush` で作成）がEXECUTE→REVIEWをゲートする。T2/T3のREVIEW cleanでは、runnerがdraft PRのstatusCheckRollupを `expectedCiChecks`（`Agent harness` を除く。draft中はskipされるためAFTERCAREで要求）のaccept条件と照合し、全checkが合格するまでpollで待つ（`--interval-seconds`）。失敗checkは `ci_reproduce`（#958の再現ゲート）で止まり、`.md`以外を含む変更でLint/Build/TestがSKIPPEDになっている場合はCI条件の誤りとして `ci_unexpected_skip` で止まる。別HEADのcheckは合否に数えない。合格が揃うと証跡を `reviewCi` に記録しcleanへ進む。`ci_reproduce` のexitはaftercareと同じ `--event ci_failure --exit <file>`（`review.on.ci_failure` → execute。`ciFailure`レコード＋`reproduction` 必須、未解決はexecute readyを塞ぎ、`not_reproduced`/往復上限でINCIDENT）。Reviewerへの検証情報はpacketの `verification-manifest.json` にCI check結果（名前・conclusion・run URL）と各checkのaccept/reason、flaky診断 `{tests, errors}`（tests.length がflaky件数）として載る。`--review-packet` フラグで再生成したpacketにも同じCI証跡が入る（best-effort: PRが存在しcheck情報を取得できる場合。取得不能なら `ciChecks` 自体を省略し、flaky診断だけの失敗は `flaky.errors` に記録して `required`/`observed` は残す）。状態ファイルは読み込み時点から別runnerに書き換えられていると保存を拒否する（lost updateを防ぐ）ので、その場合はコマンドを再実行する。

affectedは変更ファイルのうちvitestが関連テストを解決できるもの（テスト可能な拡張子・`e2e/`・metadata-only以外・存在するファイル）へ `vitest related --passWithNoTests` を実行し（process suiteのファイルはfullと同様に除外する）、証跡にscopeと対象ファイルを記録する。候補が0件の場合はfull commandへ戻り、証跡は `scope: "full"` と記録される。単独でも指定できる。

```bash
node scripts/loop-runner.mjs --verify unit --scope affected
```

検証ログは `git rev-parse --git-path agent-evidence` 配下にartifactとして保存され、worktreeを汚さない。証跡manifestは実実行の `run`（HEAD/base・時刻・時間）と適用対象の `appliesTo`（HEAD/base）を分けて記録し、exit summary・artifactのpath/SHA-256/bytesを保持する。成功時のログ本文は通常出力に含めない。失敗時のエラーはexit code・artifact path・末尾行だけを返し、全文はartifactを参照する。

HEADまたはbaseが変わるとverification証跡は全て失効する（#953で再利用機構は撤去した）。失効は実際のHEAD/base変更時だけ判定し、遷移（findings/ci_failure等）では失効しない。review・aftercare・reviewCi・assessment・skillsも同時に失効するが、assessment・skillsは前述のMachine分類不変時だけ引き継ぐ。`git fetch origin` 後も状態を再確認する。

同じ検証コマンド・終了コードが上限回数（`docs/agent-harness-states.md` のLimits）連続して失敗した場合はINCIDENTへ停止する。修正前後で原因が変わったと判断する場合も、INCIDENTのresolutionに切り分け証拠を記録して解除する。単なる再試行でカウンタをリセットしない。

## レビュー

Reviewerへ目的・AC・実差分・検証結果・関連契約を渡す。T3、未解決前提のあるT2はfresh contextの独立Reviewerが必要。レビュー結果JSONは `--draft review`（またはpacketのreview-template.json）の下書きに記入する。含める内容は次のとおり。

- `head`、`baseHead`: 対象のcommit SHA
- `reviewer`: 実装担当と区別できるID
- `independent`: 独立レビューならtrue、`context`: `fresh`
- `assessment`: risk_assessment・tier_rationale・applied_tier
- `evidence`: レビュー範囲と根拠の文字列配列
- `acceptanceCriteria`: 全ACの `{id, evidence}` 配列
- `findings`: `{id, status: open | fixed | dismissed | deferred, severity, followUp?, evidence}` 配列（0件は空配列）。`severity` は必須で `blocker | major | minor | nit`（未記入はmajor扱い）。cleanの条件は blocker / major のopen findingが0件。major以上は修正または根拠付き却下が必要で、minor / nit は修正・却下に加えて `deferred` + `followUp`（フォローアップIssue URL）で後回しにできる
- `deltaFrom`（任意）: 増分レビューの起点とする、過去のレビュー記録済みhead。現在HEADや未記録のSHAは拒否される

ラウンド数を減らすため、各ラウンドのReviewerは対象範囲（初回は全差分・全AC）を網羅し、見つけた指摘を重要度付きで一度に出す。後のラウンドへ小出しにしない。draft PRがある場合は、packet生成前に `node scripts/collect-pr-findings.mjs --pr <番号>` で外部レビュー（CodeRabbit等）の未処理指摘をファイルへ保存し、`--review-packet <dir> --external-findings <file>` で `external-findings.json` としてpacketへ含める（status行付きの出力をそのまま渡せる）。PRコメントは誰でも書けるため、ファイルは `untrusted: true` で包まれ、packetのcontractsに `skills/prompt-injection-guard` が同梱される。外部指摘の採否は独立Reviewerが判断し、同じラウンドのfindingsへ外部指摘を辿れるidで記録する。実装担当はReviewerの報告を編集しない。packet生成後に届いた外部指摘は次のラウンドかAFTERCAREで従来どおり扱う。

```bash
node scripts/loop-runner.mjs --review /tmp/review.json
node scripts/loop-runner.mjs --event clean
```

Reviewerの本人性や実施内容はAgentが正しく記録する責任を持つ。CLIは担当ID、fresh宣言、HEAD、必須深度、全AC、残存findingを検査する。過去findingは次roundにも同じIDで引き継ぐ。

独立Reviewerへ渡す材料は `--review-packet <dir>` で生成する。packet.json（目的・AC・changedPaths・risk。verificationの要約はtask-summary.jsonを参照）、diff.patch、task-summary.json、verification-manifest.json（Reviewer向けの要約。kindごとに成否・scope・末尾ログ・artifact相対パスのみ。run/appliesToやartifactのsha256・絶対パスは含まない。完全なmanifestは実装担当のworktreeで `--artifacts` を実行して取得する）、review-template.json（validateReview準拠の雛形。過去findingのid・status・severityを事前記入し、evidenceはReviewerが再確認して書く）、contracts/（AGENTS.md・workflow-review.md・required-skills）を書き出す。REVIEW状態かつclean treeが必須で、生成物はcommitしない。

```bash
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-review-packet
# dirはworktree外を推奨する（内側だと生成後にtreeが汚れる）
```

各 `review_recorded` には、そのレビューが独立・fresh contextだったか、満たしたrisk tier、spec（goal・ACのid/本文・non-goals・assumptions）のfingerprintが記録される。再レビューの `--review-packet <dir>` は、現在HEAD以外のレビュー記録を新しい順に調べ、増分条件（同一base・全ACの証跡あり・現在HEADのancestor・同じspecのfingerprint・現在のrisk以上のtier・現在独立レビューが必要なら独立レビューだったこと）を満たす最新の記録があれば、自動でその記録済みheadからの増分資料を生成する（新しい記録が不適格でも、より古い適格な記録を使う）（`reviewScope.selection: "auto"`）。満たさない場合は全差分packetへ戻る。起点を指定する場合は `--delta-from <reviewed-head>`（条件を満たさなければ拒否）、全差分を強制する場合は `--full-review` を使う。両者は併用できない。増分では `diff.patch` と `changedPaths` が起点からの増分となり、`full-diff.patch`・`allChangedPaths` で全体を参照できる。`previous-review.json` は過去のAC証跡とfinding、`priorFindings` は引き継ぐ指摘を含む。雛形の `deltaFrom` も設定される。共有契約や前提が変わった場合、Reviewerは全差分へ範囲を広げる。全ACの記録とRisk Floor・fresh独立レビューは維持する。

```bash
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-review-packet-r2   # 自動で増分
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-full --full-review
```

指摘修正は `--event findings --exit /tmp/exit.json` でEXECUTEへ戻る。exitにはreasonを必須とし、一定ラウンドごとにreassessmentを要求する。findings往復・ci_failure往復の上限値は `docs/agent-harness-states.md` のLimitsを参照し、到達はINCIDENTへ停止する。遷移時に証跡を無条件失効させることはない——証跡の失効は実際のHEAD/base変更時だけ判定する。却下で終わる指摘で検証をやり直させないためである。同じラウンドのopen findingはまとめて修正・再検証する（`.agent/workflow/review.md` 参照）。

## CI中心の検証

#952以降、合否の正本はCIのcheckであり、ローカルの必須検証は全Tierとも `process` のみ（lint/unit/buildはpre-push実行で担保し、runnerは結果を証跡として記録しない）。#953でlaneの区別自体を撤去した——全タスクが同じルールで動く。

- `--verify-required` とcheckpoint検証はprocessだけを要求・実行する。REVIEWの `clean` はT1がローカル証跡のみ、T2/T3はそれに加えて現在HEADのCI check評価（`reviewCi`）を要求する。
- EXECUTE→REVIEWの `ready` には、現在HEADに対応する `agent-prepush/<head>.ok` 成功マーカーが必要（`pnpm verify:prepush` またはpre-push hookが刻む。証跡JSONではなくファイルの存在だけを見る）。マーカーがなければreadyは拒否される。
- `aftercare` および `--check-pr` の必須checkは `expectedCiChecks(paths, assessment)` が決め、 `--check-pr` は各checkの `accept` と `reason` を `expectedChecks` として表示する。

| check | accept | reason |
| --- | --- | --- |
| `Agent harness` | `SUCCESS` のみ | delivery gate |
| `CI scope` | `SUCCESS` のみ | diff classification |
| `Lint` / `Build` / `Test` | `.md`だけの差分（`ciCodeChanged` がハーネス自身で判定）なら `SUCCESS` または `SKIPPED`。それ以外は `SUCCESS` のみ | md-only: SKIPPED accepted / required for code changes |
| `E2E (Playwright / Chromium / public)` `E2E (Playwright / Chromium / authenticated)` | `SUCCESS` のみ | `assessment.verification.e2e` がtrueのとき必須 |
| その他（`Vercel` 等） | 現行どおりのglobal判定（observed checkは成功が必要） | — |

SKIPPEDを合格として扱うのは、ハーネス自身が `.md` だけの変更と確認できた場合に限る。差分が読めない・空の場合はSUCCESS必須側へfail closedする。CI scope jobが `no_code` 判定した場合にLint/Build/TestがSKIPPEDになる経路は `.github/workflows/ci.yml` 参照。

## PRとAFTERCARE

ユーザーがPR作業を許可したタスクでは、初回のEXECUTE→REVIEW進入時にbranchをpushし、Human Requestと更新履歴ブロックを持つdraft PRを作る（`gh pr create --draft`）。状態ブロックはまだ含めない（`--export` はAFTERCARE以降のみ）。CodeRabbitはdraftもレビューするため、外部レビューが内部の独立レビューと並行して進む。draft PRでは `Agent harness` とE2Eのjobをスキップする（checkはSKIPPEDとなり、AFTERCAREが要求するSUCCESSを満たさない）。lint/test/buildのCIはdraftでも実行される。REVIEW clean後に `--sync-pr` で状態ブロックを入れてから `gh pr ready <番号>` でready化すると、`ready_for_review` で `Agent harness` とE2Eが同じHEADに対して実行される。draftはGitHubでmergeできず、AFTERCAREもnon-draftを要求するため、draft中のスキップが最終ゲートを弱めることはない。PR作業の許可がないタスクでは従来どおりAFTERCAREでPRを作る。REVIEW中のdraft PRには状態ブロックがないため、その間にSessionを失った場合は `--restore-pr` で復元できない。作業worktreeのGitメタデータから再開し、worktreeも失った場合はREFINEからやり直す。

```bash
node scripts/loop-runner.mjs --export-file /tmp/agent-state.md
node scripts/loop-runner.mjs --export > /tmp/agent-state.md   # 人が確認するとき用
```

`--export-file <path>` は指定ファイルへ、`--export` は標準出力へ同じ状態ブロックを書き出す。Agentは状態ブロックをstdoutで読まず、`--export-file` で書き出したファイルをそのままPR本文の材料にする。Human Request・説明・更新履歴ブロックと状態ブロックを1つのbodyファイルへまとめて `gh pr create --body-file` で作る例:

```bash
node scripts/loop-runner.mjs --export-file /tmp/agent-state.md
cat /tmp/pr-body.md /tmp/agent-state.md > /tmp/pr-body-full.md
gh pr create --draft --title "..." --body-file /tmp/pr-body-full.md
```

`--export` は人がターミナルで内容を確認する用途と互換性のために残す。

状態ブロック（`state-block/v2`）は復元とPR gateに必要な内容だけを載せる。`spec.ref` がissue連携タスクでは `issue#<番号>` で、`spec.fingerprint` がIssue本文の `## Agent Spec` 節のsha256を指す（`--init` / `--spec` 時に採取）。`--restore-pr` は復元時にIssueを再取得してfingerprintを照合し、不一致ならREFINEへ戻してspec再提出を求める（specの正本はIssue、ブロックは参照）。fingerprintが採れない場合や非issueタスクでは `specInline` に完全なspecを乗せる。spec本体の代わりに `{fingerprint, ref, predictedRisk, acIds, openDecisions}` を渡し、gateはこれらだけでspec不変条件（open decisionなし・AC一意）・predictedRisk・AC証跡網羅を検査する。historyは一切載せず省略件数を `historyOmitted` に累積する（完全なhistoryはworktreeのGitメタデータに残る）。configurationはruntime名だけ（復元時にruntime設定を再解決）、assessmentは復元時もCIでも実差分から再計算するため載せない。検証証跡は `{head, baseHead, exitCode}` の最小形にする。`review` は `deltaFrom` を落とす（ローカルhistory無しに再検証できないため）。`findings` が `review.findings` と同一なら省略して復元時に参照復元し、`deferredFindings`・未解決の `ciFailures`・`reviewCi`・`aftercare` はそのまま往復する。完全な旧形式（v1・`schema`フィールドなし）のブロックも読み込め、`lane`・`sameAsReview` 等の旧参照も復元する（壊れていれば拒否）。PR作成後・状態更新後は `--sync-pr <番号>` で既存本文を保持してブロックを更新する。この操作はGitHubへのwriteであり、ユーザーが許可したPR作業の範囲でのみ実行する。

`--sync-pr` は同期後の本文が既存本文と完全一致する場合、GitHub editを行わず `synced: false` を返す。更新時は `synced: true`。Human Requestや更新履歴は保持する。頻繁なCI観測やbot確認日時だけを本文へ追記せず、復元用の状態が変わる節目で同期する。

観測用のmetricsは `git rev-parse --git-common-dir` 配下の `agent-metrics.jsonl` へ1行JSONで追記する。verify（kind・durationMs・result・scope・artifactBytes・失敗signature）、revision_changed（invalidated件数・assessmentCarried）、transition、aftercare、watch_aftercare（poll回数）、review_packet（scope）、friction_note（本文先頭500文字）、usage（後述）を記録する。加えて、CLIがAgentへ返したstdout/stderrのバイト数を `cli_output`（command・outputBytes・exit）として記録する。出力本文は記録せず、`--watch-aftercare` 付きの実行はcommandへ `+watch-aftercare` を付記して区別する。アクション指定のない引数なし実行（通常の再開）は `none` として記録する。taskが読めない実行（init前や早期失敗）はtask=nullで記録する。common dir配下なのでlinked worktreeを跨いで集計でき、worktreeは汚れない。追記はbest-effortであり、失敗しても本処理を止めない。環境変数 `AGENT_METRICS_FILE` で出力先を上書きでき、Vitest実行中（`VITEST` 設定時）に上書きがなければ記録しない。テストが実リポジトリの集計を汚さないためである。

トークン量はセッションtranscriptから記録する。Claude Codeは `~/.claude/projects/<project>/<session>.jsonl`、Codexは `~/.codex/sessions/**/rollout-*.jsonl` を渡す。Claude Codeはresponse idで重複を除き、Codexは最後の累積値を使う。input（uncached）・cache read・cache write・output・reasoning（outputの内数）・呼び出し数を記録する。taskもPR本文も変更しない観測専用の操作である。独立Reviewerのtranscriptは `--usage-role reviewer` で記録する。

`--record-usage` の記録が1件もないroleは、`tokens.<role>` と `modelCalls.<role>` が0ではなく `null`（未計測）になる。PRコメントとevalのreportは「未計測」と表示し、差分には含めない。片方のroleだけ記録した場合の合計は、そのroleだけの値で、両roleを記録した実行とは比較できないため、evalのreportは計測済みroleの集合が違う項目に差分を出さない。DevinはtranscriptもトークンAPIも使えず未計測になるため、トークン・モデル呼び出し数を比べるevalはClaude CodeかCodexで実行する（`eval/harness/README.md`）。

```bash
node scripts/loop-runner.mjs --record-usage ~/.claude/projects/<project>/<session>.jsonl
node scripts/loop-runner.mjs --record-usage <reviewer-transcript.jsonl> --usage-role reviewer
```

```bash
node scripts/loop-metrics.mjs            # 全期間の集計
node scripts/loop-metrics.mjs --task i123   # タスク別集計
node scripts/loop-metrics.mjs --path /tmp/other.jsonl
```

`loop:metrics` はJSONLを集計し、action別件数・durationMs・verifyのkind別pass/fail・scope別件数・revision_changedのinvalidated/assessmentCarried・review_packetのscope別件数・transitionイベント別件数を返す。cli_outputはcommand別のoutputBytes（合計・平均・最大）を `byCommand` に返す。usageはtranscriptごとの最新記録だけを数え、role別と合計を `usage` に返す。作業中に感じた摩擦は `--friction-note <text>` で `task.frictionNote` へ記録でき、history・metricsに残る（v2状態ブロックは最小化のため含めない）。ハーネス改善タスクの定性入力として使う。

`Agent harness` CIはMarkdownのみの変更でも動き、実PR HEAD/base・実差分・仕様・検証・レビューを照合する。非bot PRは状態ブロック必須（draft PRではjobごとスキップし、ready化で実行する）。GitHubが認識するdependabot/github-actionsのBot投稿は例外とし、processテストとドキュメントチェックは実行する。既存PRもこのworkflowが走る時点で状態ブロックが必要になる。CIを必須チェックへ登録するbranch protection設定は別途管理者の操作が必要であり、このPRでは権限設定を変更しない。

```bash
node scripts/loop-runner.mjs --aftercare 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --event ready --handled /tmp/handled.txt
node scripts/loop-runner.mjs --sync-pr 123
```

状態や本文を更新せず現在のPRを確認する場合は `--check-pr` を使う。AFTERCARE/DONEで利用でき、PR CIと共通のlocal検証・レビューcheckpointを照合した後、GitHubを再取得してHEAD/base・最新CI・approval・mergeability・findingを確認する。成功時は `ready: true` と要約を返す。gate条件（check失敗・未処理finding・approval欠落等）を満たさない場合は `ready: false` と `gateError`（失敗理由）を返す。`expectedChecks`（要求check名・accept・reason）も返し、何が不合格の根拠かをそのまま確認できる。HEAD/baseの変化やローカル改変などの整合性エラーは従来どおり失敗する。古いDONE記録だけを成功根拠にしない。PRの状態確認は `--check-pr` に統一し、`gh pr view` で本文（body）を取得しない——状態ブロックごとcontextへ読み込まれるため。`gh` が必要な場合だけ `--json` で body 以外のフィールドを指定する。

```bash
node scripts/loop-runner.mjs --check-pr 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --check-pr 123 --handled /tmp/handled.txt --watch-aftercare
```

check-prの監視は同じ状態変化イベントを使うが、taskのaftercare証跡やhistoryを更新しない。監視回数は観測用metricsへ残る。未処理指摘・未解決thread・新しい失敗・承認待ち・revision変更では `ready: false, reason: action_required` で即座にAgentへ戻す。同名の新しいcheckがpendingの間は、旧失敗だけで待機を中断しない。待機上限では `ready: false` を返し、完了扱いしない。DONE本文の同期後はこの経路で再確認し、観測のたびに本文同期や状態遷移を繰り返さない。handled記録はローカルの観測補助であり、別SessionではPR状態を復元した後に最新コメントを取得・再確認して作成する。復元用Spec・Risk・finding・検証・レビュー記録は従来どおり本文の状態ブロックへ保存する。

CI完了を待つ場合は `--watch-aftercare` を付けてpollできる。初回snapshotは `changed:false` のeventとして必ず返し、以後は状態変化時だけ差分eventを返す（`changed:true`・ready・変化したスカラー値・`added`/`removed` のpending/failed一覧・消えたキー名の `removedKeys`。変化なしの項目は出さない）。結果の `watch.last` に最終snapshot全体を1つ含めるので差分から状態を復元する必要はない。変化のないpollは何も出力しない。間隔は `--interval-seconds`（既定60秒）、上限は内部deadline（既定15分）。readyになった時点で通常のaftercare証跡を記録する。ready検知pollで取ったPR・findingsはaftercare証跡側のbeforeとして再利用し、追加の取得は照合用の `after` 1回だけにする（PR計2回・findings計1回）。before/afterのheadRefOid・baseRefName一致チェックは従来どおり行う。findings収集のowner/repoはremote URLから1回だけ解決して `--repo` で渡し、解決できない場合だけ `gh repo view` 1回にフォールバックする。

```bash
node scripts/loop-runner.mjs --aftercare 123 --watch-aftercare --interval-seconds 30
```

CI失敗時は `--ci-failures <番号>` で失敗checkを機械抽出する（read-only、状態を更新しない）。結果は `{check, head, runUrl, artifactUrl, failedTests[{file,title}], reproduce}` の配列で、`reproduce` はローカル再現コマンド（E2Eは `pnpm run e2e:isolated -- <file> --grep "<title>"` を失敗testごとに `&&` 連結、unitは `vitest run <file> -t "<title>"`、lint/buildは該当コマンド全体）。このレコードと再現結果 `{command, result: reproduced|not_reproduced, note}` を `ci_failure` イベントのexitとして必須で渡す。`not_reproduced` は修復を推測せず INCIDENT へ遷移する。

```bash
node scripts/loop-runner.mjs --ci-failures 123
```

`ci_failure` でEXECUTEへ戻ったtaskは、未解決のciFailureレコードがある限り `ready` をブロックされる（複数checkの同時失敗は `ciFailure` を配列で1遷移にまとめて記録する）。修正をpushしたら `--resolve-ci-failures` を実行する（executeまたはaftercareでのみ有効）。runner自身がpush前検証を実行する（E2E/unitの失敗は失敗spec/testファイルを対象化、lint/build等のジョブ単位失敗は全量実行）。exit 0 の記録だけが `resolvedAt`/`resolvedHead` を刻む。成功マーカーや自己申告の残存だけでは解決にならない。

```bash
node scripts/loop-runner.mjs --resolve-ci-failures
```

`--check-pr` の出力には `flakyTests`（成功E2E checkのjobログから拾った passed-on-retry、`{check,file,title}`）と `flakyErrors`（ログ取得失敗の `{check,error}`、なければ `[]`）を含む。playwright JSONレポート（`e2e-results/results.json`）もCI job summaryへ出力され、flaky観測時はfollow-up Issueを起票する。E2Eリトライはlocal/CIとも1回に統一。

aftercareおよびDONEへの遷移直前はGitHubを再取得し、最新HEAD/base、CI全体、必須チェック、approval、mergeability、ページ取得完了、未処理指摘0件を確認する。E2E必須ならpublic/authenticated両方の成功を要求する。handledは `scripts/collect-pr-findings.mjs` の `<finding id> <updatedAt>` 形式。収集時、本文はGitHub上で表示されないマークアップ（HTMLコメント・行全体のリンク参照定義）を除去し、除去でできた3行以上の連続空行は2行へ詰めてから上限まで切り詰める。フェンス・インラインコード内のマークアップは表示されるため保持する。除去量は `strippedChars`、正規化後に本文が空になる候補は `bodyInvisibleOnly` で分かる。本文が切れている候補は全文を読んで判定する。収集コマンドのPASSだけではaftercareを完了できない。

別worktreeから再開する場合は対象branch/HEADをcheckoutし、`--restore-pr <番号>` で復元する。復元先に既存タスクがある場合や別branchの状態は拒否する。PR本文のsnapshotが古い場合は過去のRisk・finding・counterを保持し、検証を失効してEXECUTEへ戻す。復元前にcurrent PR HEAD/baseをfetchしてcheckoutする。PR本文への同期でチェックが再実行された場合はその完了を確認する。DONEはmerge_readyを表し、merge自体はユーザーの許可に従う。
