# Agent Harness詳細仕様

このCLIはタスクごとの仕様・Profile・評価・検証・レビュー・停止条件を接続する。AGENTS.mdを入口としてAgentが起動する。Codex/Devin自体を自動起動したり、実行中のモデルの推論設定を変更する機能はない。autonomy/delegation/contextはAgentが遵守する方針、verification=thoroughは追加のlocal検証として機械適用する。

ProfileはREFINE終了時に、Agentが記録した評価（`blast_radius`・`uncertainty`・検証負荷）から規則で自動判定される。`--profile` の明示指定は常に優先される。実装中に評価入力が変わった場合だけ再判定し、自動選択は上位へしか移動しない。下位への変更にはユーザー指定または根拠記録が必要である。選択値・選択元・参照した評価・根拠・規則バージョンは状態に記録され、PR gateでも照合される。

本書は現行CLIの詳細仕様を記載する。起動に必要な操作手順は [Agent Harness操作手順](agent-harness.md)（起動用クイックリファレンス）を参照する。軽量化の設計正本は [Agent Harness設計](agent-harness-design.md) を参照する。出力・検証・証跡管理のさらなる変更は未実装であり、現在は本書の仕様が正本である。

## 開始と再開

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。Agentが毎回新規作成するSkillではない。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。

1. 専用worktreeでclean baselineを確認する。
2. 作業仕様JSONをリポジトリ外（例: `/tmp/spec.json`）に作る。必須フィールドは `.agent/schema/spec.schema.json` を参照。`predictedRisk` も必須。Human Requestを改変せずGoal/AC/Non-goals/Assumptions/Verification Strategyを整理する。
3. 次を実行し、現在のworkflowを読む。開始時のProfileは仮のdefaultであり、REFINE終了時に自動判定で確定される。Profileを明示する場合は `--profile <name>` を付ける（指定値は常に優先される）。

```bash
node scripts/loop-runner.mjs --init /tmp/spec.json --task issue-123 --runtime codex --implementer session-123
```

Devinでは `--runtime devin`、Claude Codeでは `--runtime claude-code` を指定する。旧来のモデル指定オプションは互換のため受理されるが、何も記録・参照しない。

4. REFINEの評価を記録し、EXECUTEへ進む。`--assessment` のJSONには `risk_assessment`・`tier_rationale`・`applied_tier` に加えて、Profile判定の入力となる `verification_load: {level: routine|complex, rationale}` を含める。これらの入力が欠ける場合、`ready` はREFINEの不足条件として拒否される。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json
node scripts/loop-runner.mjs --event ready
```

base既定値は `origin/preview`。別baseは開始時に `--base` で指定する。作業状態はworktree固有のGitメタデータに保存する。通常の再開は引数なしで実行する。`--state` は保存済み状態との一致確認専用であり、状態を飛ばす指定ではない。

通常出力は要約だけを返す。taskId・state・workflow（現在Stateのworkflowパス）・head/base・risk・profile・missing・verification・openFindings・aftercare・next を含み、spec・history・configuration・評価本文・ログ本文は含まない。不足要件の根拠が必要な場合だけ `--explain`、検証証跡のmanifestだけ `--artifacts`、状態スナップショットは `--status` で確認する。状態ブロック全体は `--export` / `--export-file <path>` / `--sync-pr` でのみ出力する。

仕様の修正はREFINEで `--spec /tmp/spec.json`。未決事項があれば `--event decision_required --exit /tmp/exit.json` で停止する。exitにはreasonを記録する。Human Gateの解除には `approval: {"source":"user","reference":"対象と操作を承認したユーザー指示の参照"}` が必要。承認記録はAgentの責任であり、このJSONだけで人間の本人性を証明するものではない。

## 実装と検証

変更後に実差分を評価し、必要Skillを読んで記録する。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json --skills workspace-preflight,security-review
```

assessmentは `scripts/review-depth.mjs` のrisk_assessment・tier_rationale・applied_tier形式に `verification_load` を加えた形。EXECUTE/REVIEWで再提出した評価が影響範囲・不確実性・検証計画の変化を示す場合だけProfileを再判定する（自動選択は上位へのみ）。通常の修正・テスト実行・CI待ち・コミットでは再判定しない。

HEAD/baseが変わると評価は原則失効するが、新revisionのMachine分類（machine floor・floor trigger・required skills・runtimeRelevant・必須検証kind）が直前の評価時と同一なら、Agent評価とskills記録を引き継ぎ、historyとmetricsに `assessmentCarried: true` を残す。分類が1つでも変わった場合は従来どおり `--assessment` の再提出を求める。引き継ぎは機械分類の不変性だけを根拠とするため、Agentが変更の性質や影響範囲の変化を認識した場合は分類が同じでも再提出する。REFINEへ戻ったタスクには引き継がない。runnerはGitの実差分を取得し、Spec予測・Machine・Agent・Reviewer・過去の最高Riskを統合する。診断CLIの `--paths` はrunner/CIの評価を差し替えられない。Machine Floorはパスルールに加えてhunkの中身（追加・削除行）でも判定する。`convex/**`・`src/**` の非テスト `.ts`/`.tsx` で、認証・認可（`getUserIdentity`/`ctx.auth`/`assert*Member|Owner|Admin`/`role === "owner|member"` 等）、削除・retention（`ctx.db.delete`、convex内の `.delete(`、`scheduler.run(After|At)`+delete）、schema/migration（`defineTable`/`defineSchema`/`.index(`）、外部write/webhook（convex内の `fetch(`、`httpAction`、`Resend`、`api.line.me`）を含む変更行は対応するtriggerを `source: "content"` で発火する。コメント・文字列リテラルの変更でも発火する（過検知許容）。hunkの読み取りはcontent rule対象のpathを含む変更でのみ行い、その取得に失敗した場合はfail-closedでT3（`diff_read_failed`。非コードのみの変更では読み取り自体を行わない）。`suggest-skills.mjs` も同じcontent判定で `security-review` を推奨する（`diff_read_failed` 単体では推奨しない）。

変更をcommitしてから検証する。pre-commitは初期化済みEXECUTE状態を要求する。

```bash
node scripts/loop-runner.mjs --verify-required
node scripts/loop-runner.mjs --event ready
```

必要な検証のみ実行する。固定コマンドをCLIが起動し、終了結果を現在HEAD/baseへ紐づける。processはドキュメント整合とprocessテスト、lintはlintとformat、unitはVitest全体からprocess suite（`test:process` のファイル）を除いたもの、buildは本番ビルド。processは全変更で必須なので、process suiteのファイルをunitで二重に実行しない。`test:process` が `vitest run <files>` 形式で読めない場合は除外せず全体を実行する。CIのTestは常に全件を実行する。dirty treeでは証跡を確定しない。

`--verify-required` は現在の評価で必須のlocal検証を直列実行し、成功したkindごとに証跡を保存する。現在HEAD/baseで成功済みのkindは省略し、最初の失敗で停止する。E2Eは従来どおりGitHubのdelivery gateとなる。修正・再開時にHEAD/baseが変われば通常の失効判定を適用する。単独kindの `--verify <kind>` も利用できる。状態ファイルを更新するrunnerを同じworktreeで並行起動しない。

unitの範囲はゲートごとに異なる。EXECUTEの `--verify-required` はunitを差分関連（affected）で実行し、EXECUTE→REVIEWはそれで満たせる。REVIEW clean・AFTERCARE ready・PR checkpoint（`Agent harness` CI）はcurrent HEADのfull unit証跡を必須とし、affectedの証跡では通らない（不足は `verify:unit(full)` と表示される）。REVIEW状態の `--verify-required` は残りのfull unitだけを実行するので、独立Reviewerへpacketを渡した後、レビューと並行して実行できる。並行するのはrunnerとReviewerであり、`--review` の記録は `--verify-required` の終了後に行う。状態ファイルは読み込み時点から別runnerに書き換えられていると保存を拒否する（lost updateを防ぐ）ので、その場合はコマンドを再実行する。full unitが失敗したら `--event findings` でEXECUTEへ戻す。

affectedは変更ファイルのうちvitestが関連テストを解決できるもの（テスト可能な拡張子・`e2e/`・metadata-only以外・存在するファイル）へ `vitest related --passWithNoTests` を実行し（process suiteのファイルはfullと同様に除外する）、証跡にscopeと対象ファイルを記録する。候補が0件の場合はfull commandへ戻り、証跡は `scope: "full"` と記録される。単独でも指定できる。

```bash
node scripts/loop-runner.mjs --verify unit --scope affected
```

検証ログは `git rev-parse --git-path agent-evidence` 配下にartifactとして保存され、worktreeを汚さない。証跡manifestは実実行の `run`（HEAD/base・時刻・時間）と適用対象の `appliesTo`（HEAD/base・head tree・feature patch SHA-256・contract version）を分けて記録し、exit summary・artifactのpath/SHA-256/bytesを保持する。成功時のログ本文は通常出力に含めない。失敗時のエラーはexit code・artifact path・末尾行だけを返し、全文はartifactを参照する。

HEAD/base更新で古い検証・レビューは失効するが、verification証跡だけは安全に部分再利用できる。feature patch（merge-base差分のSHA-256）と検証対象のhead treeがともに不変な場合のみ `appliesTo` を新revisionへ更新し、`reuse.from` に元revisionを記録する。同一のtree入力には同一の結果を再現できる——入力推論は行わない。ツールチェーン・gitignore済みファイルなどtree外の入力はfingerprintできない残差だが、必須確認はCIが実HEAD上で再実行するため再利用はローカル短絡に留まる。`run` は実実行の記録のまま書き換えない。fingerprintの計算不能・contract version不一致・必須metadata欠落はすべてfail-closedで失効する。review・aftercareは再利用しない。assessment・skillsは前述のMachine分類不変時だけ引き継ぐ。`git fetch origin` 後も状態を再確認する。

base不変の増分commitについては第2の再利用経路がある。増分差分 `旧HEAD..新HEAD` の全pathがmetadata-only（Markdown・`.github/ISSUE_TEMPLATE/`・`.husky/`）の場合、process以外の証跡の `appliesTo` を延長する。`reuse.basis` は `identical_patch_and_tree` または `metadata_only_increment` を記録し、後者は増分path一覧も保持する。増分が取得不能・空・非metadataを含む場合はこの経路を使わない。process証跡はdocs整合を検査するためmetadata変更でも再実行する。lintは `oxfmt --check` がISSUE_TEMPLATE配下のYAML/JSONやwell-known filename（README・Jakefile・Pipfile等）を観測し得るため、増分が `.md` と `.husky/` 配下の正規hook名のみの場合に限り延長される。buildはmetadataを観測しない。unitのfull suiteにはmetadataを読むworkflow/docs契約テストが含まれ得るが、それらは全てprocess suite（延長不可・必須・毎回再実行）に閉じ込められており、process側が増分の正当性を判定する。metadata dir配下の `*.{test,spec}.*` はvitestがdot-dir内も探索するためmetadata-onlyから除外される。test:process外にmetadataを読むテストが追加されるとguard testが失敗する。

同じ検証コマンド・終了コードが連続して3回失敗した場合はINCIDENTへ停止する。修正前後で原因が変わったと判断する場合も、INCIDENTのresolutionに切り分け証拠を記録して解除する。単なる再試行でカウンタをリセットしない。

## レビュー

Reviewerへ目的・AC・実差分・検証結果・関連契約を渡す。T3、未解決前提のあるT2はfresh contextの独立Reviewerが必要。レビュー結果JSONには次を含める。

- `head`、`baseHead`: 対象のcommit SHA
- `reviewer`: 実装担当と区別できるID
- `independent`: 独立レビューならtrue、`context`: `fresh`
- `assessment`: risk_assessment・tier_rationale・applied_tier
- `evidence`: レビュー範囲と根拠の文字列配列
- `acceptanceCriteria`: 全ACの `{id, evidence}` 配列
- `findings`: `{id, status: open | fixed | dismissed, severity?, evidence}` 配列（0件は空配列）。`severity` は任意で `blocker | major | minor | nit`。重要度にかかわらず、cleanには全findingの修正または根拠付き却下が必要
- `deltaFrom`（任意）: 増分レビューの起点とする、過去のレビュー記録済みhead。現在HEADや未記録のSHAは拒否される

ラウンド数を減らすため、各ラウンドのReviewerは対象範囲（初回は全差分・全AC）を網羅し、見つけた指摘を重要度付きで一度に出す。後のラウンドへ小出しにしない。draft PRがある場合は、packet生成前に `node scripts/collect-pr-findings.mjs --pr <番号>` で外部レビュー（CodeRabbit等）の未処理指摘をファイルへ保存し、`--review-packet <dir> --external-findings <file>` で `external-findings.json` としてpacketへ含める（status行付きの出力をそのまま渡せる）。PRコメントは誰でも書けるため、ファイルは `untrusted: true` で包まれ、packetのcontractsに `skills/prompt-injection-guard` が同梱される。外部指摘の採否は独立Reviewerが判断し、同じラウンドのfindingsへ外部指摘を辿れるidで記録する。実装担当はReviewerの報告を編集しない。packet生成後に届いた外部指摘は次のラウンドかAFTERCAREで従来どおり扱う。

```bash
node scripts/loop-runner.mjs --review /tmp/review.json
node scripts/loop-runner.mjs --event clean
```

Reviewerの本人性や実施内容はAgentが正しく記録する責任を持つ。CLIは担当ID、fresh宣言、HEAD、必須深度、全AC、残存findingを検査する。過去findingは次roundにも同じIDで引き継ぐ。

独立Reviewerへ渡す材料は `--review-packet <dir>` で生成する。packet.json（目的・AC・changedPaths・risk・reuseCandidates。verificationの要約はtask-summary.jsonを参照）、diff.patch、task-summary.json、verification-manifest.json（Reviewer向けの要約。kindごとに成否・scope・reuseのbasis・末尾ログ・artifact相対パスのみ。run/appliesToフィンガープリントやartifactのsha256・絶対パスは含まない。完全なmanifestは実装担当のworktreeで `--artifacts` を実行して取得する）、review-template.json（validateReview準拠の雛形。過去findingのid・status・severityを事前記入し、evidenceはReviewerが再確認して書く）、contracts/（AGENTS.md・workflow-review.md・required-skills）を書き出す。REVIEW状態かつclean treeが必須で、生成物はcommitしない。reuseCandidatesにはfeature patch fingerprintと再利用済みkindだけを記録し、review証跡は再利用しない。

```bash
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-review-packet
# dirはworktree外を推奨する（内側だと生成後にtreeが汚れる）
```

各 `review_recorded` には、そのレビューが独立・fresh contextだったか、満たしたrisk tier、spec（goal・ACのid/本文・non-goals・assumptions）のfingerprintが記録される。再レビューの `--review-packet <dir>` は、現在HEAD以外のレビュー記録を新しい順に調べ、増分条件（同一base・全ACの証跡あり・現在HEADのancestor・同じspecのfingerprint・現在のrisk以上のtier・現在独立レビューが必要なら独立レビューだったこと）を満たす最新の記録があれば、自動でその記録済みheadからの増分資料を生成する（新しい記録が不適格でも、より古い適格な記録を使う）（`reviewScope.selection: "auto"`）。満たさない場合は全差分packetへ戻る。起点を指定する場合は `--delta-from <reviewed-head>`（条件を満たさなければ拒否）、全差分を強制する場合は `--full-review` を使う。両者は併用できない。増分では `diff.patch` と `changedPaths` が起点からの増分となり、`full-diff.patch`・`allChangedPaths` で全体を参照できる。`previous-review.json` は過去のAC証跡とfinding、`priorFindings` は引き継ぐ指摘を含む。雛形の `deltaFrom` も設定される。共有契約や前提が変わった場合、Reviewerは全差分へ範囲を広げる。全ACの記録とRisk Floor・fresh独立レビューは維持する。

```bash
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-review-packet-r2   # 自動で増分
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-full --full-review
```

指摘修正は `--event findings --exit /tmp/exit.json` でEXECUTEへ戻る。exitにはreasonを必須とし、3roundごとにreassessmentを要求する。9round到達はINCIDENTへ停止する。CI修正はci_failureイベントで同様に戻り、3round上限を持つ。遷移時に証跡を無条件失効させることはない——証跡の失効は実際のHEAD/base変更時だけ判定する。却下で終わる指摘やmetadata-onlyの修正で全検証をやり直させないためである。同じラウンドのopen findingはまとめて修正・再検証する（`.agent/workflow/review.md` 参照）。

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

状態ブロックは復元とPR gateに必要な内容だけを載せる。assessmentは復元時もCIでも実差分から再計算するため `null`、検証証跡の `summary` はexit codeだけを残しログ末尾はローカルartifactに置く。historyは直近12件に加えて、最新の `review_recorded` と `review.deltaFrom` が指す `review_recorded` を残し、省略件数を `historyOmitted` に累積する。`review` 本体と完全に同じ内容は参照に置き換える。`findings` が `review.findings` と同一なら省略し、最新の `review_recorded` のfindings・AC証跡が `review` と同一なら `sameAsReview: true` にする。`--restore-pr` とPR CIは解析時にこれらを `review` から復元し、参照が壊れていれば拒否する。それより古い `review_recorded` はAC証跡だけを残す（findingは後のレビューが同じidで引き継ぐ）。完全なhistoryはworktreeのGitメタデータ（`git rev-parse --git-path agent-task.json`）に残る。実PRでの圧縮率は56〜68%で、GitHubのPR本文上限（65,536文字）にも余裕ができる。PR作成後・状態更新後は `--sync-pr <番号>` で既存本文を保持してブロックを更新する。この操作はGitHubへのwriteであり、ユーザーが許可したPR作業の範囲でのみ実行する。

`--sync-pr` は同期後の本文が既存本文と完全一致する場合、GitHub editを行わず `synced: false` を返す。更新時は `synced: true`。Human Requestや更新履歴は保持する。頻繁なCI観測やbot確認日時だけを本文へ追記せず、復元用の状態が変わる節目で同期する。

観測用のmetricsは `git rev-parse --git-common-dir` 配下の `agent-metrics.jsonl` へ1行JSONで追記する。verify（kind・durationMs・result・scope・artifactBytes・失敗signature）、revision_changed（reused/invalidated件数・assessmentCarried）、transition、aftercare、watch_aftercare（poll回数）、review_packet（scope）、friction_note（本文先頭500文字）、usage（後述）を記録する。加えて、CLIがAgentへ返したstdout/stderrのバイト数を `cli_output`（command・outputBytes・exit）として記録する。出力本文は記録せず、`--watch-aftercare` 付きの実行はcommandへ `+watch-aftercare` を付記して区別する。アクション指定のない引数なし実行（通常の再開）は `none` として記録する。taskが読めない実行（init前や早期失敗）はtask=nullで記録する。common dir配下なのでlinked worktreeを跨いで集計でき、worktreeは汚れない。追記はbest-effortであり、失敗しても本処理を止めない。環境変数 `AGENT_METRICS_FILE` で出力先を上書きでき、Vitest実行中（`VITEST` 設定時）に上書きがなければ記録しない。テストが実リポジトリの集計を汚さないためである。

トークン量はセッションtranscriptから記録する。Claude Codeは `~/.claude/projects/<project>/<session>.jsonl`、Codexは `~/.codex/sessions/**/rollout-*.jsonl` を渡す。Claude Codeはresponse idで重複を除き、Codexは最後の累積値を使う。input（uncached）・cache read・cache write・output・reasoning（outputの内数）・呼び出し数を記録する。taskもPR本文も変更しない観測専用の操作である。独立Reviewerのtranscriptは `--usage-role reviewer` で記録する。

```bash
node scripts/loop-runner.mjs --record-usage ~/.claude/projects/<project>/<session>.jsonl
node scripts/loop-runner.mjs --record-usage <reviewer-transcript.jsonl> --usage-role reviewer
```

```bash
node scripts/loop-metrics.mjs            # 全期間の集計
node scripts/loop-metrics.mjs --task issue-123   # タスク別集計
node scripts/loop-metrics.mjs --path /tmp/other.jsonl
```

`loop:metrics` はJSONLを集計し、action別件数・durationMs・verifyのkind別pass/fail・scope別件数・revision_changedのreused/invalidated/assessmentCarried・review_packetのscope別件数・transitionイベント別件数を返す。cli_outputはcommand別のoutputBytes（合計・平均・最大）を `byCommand` に返す。usageはtranscriptごとの最新記録だけを数え、role別と合計を `usage` に返す。作業中に感じた摩擦は `--friction-note <text>` で `task.frictionNote` へ記録でき、history・metrics・export状態ブロックに残る。ハーネス改善タスクの定性入力として使う。

`Agent harness` CIはMarkdownのみの変更でも動き、実PR HEAD/base・実差分・仕様・検証・レビューを照合する。非bot PRは状態ブロック必須（draft PRではjobごとスキップし、ready化で実行する）。GitHubが認識するdependabot/github-actionsのBot投稿は例外とし、processテストとドキュメントチェックは実行する。既存PRもこのworkflowが走る時点で状態ブロックが必要になる。CIを必須チェックへ登録するbranch protection設定は別途管理者の操作が必要であり、このPRでは権限設定を変更しない。

```bash
node scripts/loop-runner.mjs --aftercare 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --event ready --handled /tmp/handled.txt
node scripts/loop-runner.mjs --sync-pr 123
```

状態や本文を更新せず現在のPRを確認する場合は `--check-pr` を使う。AFTERCARE/DONEで利用でき、PR CIと共通のlocal検証・レビューcheckpointを照合した後、GitHubを再取得してHEAD/base・最新CI・approval・mergeability・findingを確認する。成功時は `ready: true` と要約を返し、条件を満たさなければ失敗する。古いDONE記録だけを成功根拠にしない。

```bash
node scripts/loop-runner.mjs --check-pr 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --check-pr 123 --handled /tmp/handled.txt --watch-aftercare
```

check-prの監視は同じ状態変化イベントを使うが、taskのaftercare証跡やhistoryを更新しない。監視回数は観測用metricsへ残る。未処理指摘・未解決thread・新しい失敗・承認待ち・revision変更では `ready: false, reason: action_required` で即座にAgentへ戻す。同名の新しいcheckがpendingの間は、旧失敗だけで待機を中断しない。待機上限では `ready: false` を返し、完了扱いしない。DONE本文の同期後はこの経路で再確認し、観測のたびに本文同期や状態遷移を繰り返さない。handled記録はローカルの観測補助であり、別SessionではPR状態を復元した後に最新コメントを取得・再確認して作成する。復元用Spec・Risk・finding・検証・レビュー記録は従来どおり本文の状態ブロックへ保存する。

CI完了を待つ場合は `--watch-aftercare` を付けてpollできる。初回snapshotは `changed:false` のeventとして必ず返し、以後は状態変化時だけ差分eventを返す（`changed:true`・ready・変化したスカラー値・`added`/`removed` のpending/failed一覧・消えたキー名の `removedKeys`。変化なしの項目は出さない）。結果の `watch.last` に最終snapshot全体を1つ含めるので差分から状態を復元する必要はない。変化のないpollは何も出力しない。間隔は `--interval-seconds`（既定60秒）、上限は内部deadline（既定15分）。readyになった時点で通常のaftercare証跡を記録する。ready検知pollで取ったPR・findingsはaftercare証跡側のbeforeとして再利用し、追加の取得は照合用の `after` 1回だけにする（PR計2回・findings計1回）。before/afterのheadRefOid・baseRefName一致チェックは従来どおり行う。findings収集のowner/repoはremote URLから1回だけ解決して `--repo` で渡し、解決できない場合だけ `gh repo view` 1回にフォールバックする。

```bash
node scripts/loop-runner.mjs --aftercare 123 --watch-aftercare --interval-seconds 30
```

aftercareおよびDONEへの遷移直前はGitHubを再取得し、最新HEAD/base、CI全体、必須チェック、approval、mergeability、ページ取得完了、未処理指摘0件を確認する。E2E必須ならpublic/authenticated両方の成功を要求する。handledは `scripts/collect-pr-findings.mjs` の `<finding id> <updatedAt>` 形式。収集時、本文はGitHub上で表示されないマークアップ（HTMLコメント・行全体のリンク参照定義）を除去し、除去でできた3行以上の連続空行は2行へ詰めてから上限まで切り詰める。フェンス・インラインコード内のマークアップは表示されるため保持する。除去量は `strippedChars`、正規化後に本文が空になる候補は `bodyInvisibleOnly` で分かる。本文が切れている候補は全文を読んで判定する。収集コマンドのPASSだけではaftercareを完了できない。

別worktreeから再開する場合は対象branch/HEADをcheckoutし、`--restore-pr <番号>` で復元する。復元先に既存タスクがある場合や別branchの状態は拒否する。PR本文のsnapshotが古い場合は過去のRisk・finding・counterを保持し、検証を失効してEXECUTEへ戻す。復元前にcurrent PR HEAD/baseをfetchしてcheckoutする。PR本文への同期でチェックが再実行された場合はその完了を確認する。DONEはmerge_readyを表し、merge自体はユーザーの許可に従う。
