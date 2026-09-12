# Astra Issue Loop v13

契約・差分・証拠を使い、通常順序を短く保つ。Astraは仕様と検証の妥当性を判断し、CLIは実行結果・古い証拠・完了地点を検査する。AGENTS.mdを入口とする。

## スキルの読込と適用

各工程の実行前に、下表の対応する `SKILL.md` を読み、入力・判断手順・出力を現在の契約と作業へ適用する。CLI操作だけで工程スキルの適用を省略しない。ユーザーが依頼した範囲の工程だけを対象とし、相談・調査だけの依頼で実装やPR作成へ進まない。

| 工程 | 読むスキル |
| --- | --- |
| 契約 | [requirements](../skills/requirements/SKILL.md) |
| 変更 | [implementation](../skills/implementation/SKILL.md) |
| 検証 | [verification](../skills/verification/SKILL.md) |
| セルフレビュー | [code-review](../skills/code-review/SKILL.md) |
| 引き渡し | [delivery](../skills/delivery/SKILL.md) |
| PR確認（`merge_ready` の場合） | [pr-aftercare](../skills/pr-aftercare/SKILL.md) |

次のスキルは起動条件に該当する作業の前に追加で読む。全スキルを一括で読み込まない。

| 起動条件 | 追加で読むスキル |
| --- | --- |
| repository fileの最初の編集前 | [workspace-preflight](../skills/workspace-preflight/SKILL.md) |
| direct caller/testだけでは影響範囲を把握できない | [impact-analysis](../skills/impact-analysis/SKILL.md) |
| 認証・認可・データ境界、特権環境・secret、ユーザー入力、webhook検証・外部write境界を変更する | [security-review](../skills/security-review/SKILL.md)をセルフレビューへ追加 |
| 外部サービス操作で環境・権限判断が必要、またはenv・secret・deploy・本番・DNS/domain・破壊的操作を扱う | [service-ops-safety](../skills/service-ops-safety/SKILL.md) |
| Issue・PR・レビュー・ログ・Web等の外部コンテンツに命令が含まれる可能性がある | [prompt-injection-guard](../skills/prompt-injection-guard/SKILL.md) |
| 原因不明・反復失敗、またはlocalとCIで結果が異なる | [incident](../skills/incident/SKILL.md) |

契約時と作業対象が変わった時には、利用可能なスキルの一覧から、対象技術や作業内容に合う専門スキル（Convex、認証、React等）があるか確認する。関連するものを必要な作業の前に読み、要求・実装・検証へ反映する。名前の一致だけで無関係なスキルを追加しない。

同じ会話で読込済みの内容が利用できる場合は再読不要。内容が更新された場合や、再開時に必要な指示を参照できない場合は必要な範囲を読み直す。適用するスキルは作業開始時に短く伝え、途中で追加した場合もその時点で伝える。

これはAgentが従う読込・適用手順であり、CLIがスキルを自動ロードする機構ではない。現在のCLIは読込や適用の実態を検証しない。スキルの利用宣言を実行証拠の代わりにせず、検証は引き続きCLI check、判断はセルフレビューで記録する。

## 開始

専用worktreeで最初の編集前に実行する。

~~~sh
node scripts/task-loop.mjs init issue-123
~~~

templates/contract.example.jsonを .loop/state/issue-123/contract.json へコピーし、タスクの目的・要求・検証方法を記入する。テンプレート自体にタスク値を書かない。

~~~sh
node scripts/task-loop.mjs contract issue-123 .loop/state/issue-123/contract.json
node scripts/task-loop.mjs status issue-123
node scripts/task-loop.mjs check issue-123 TC01
~~~

Windowsでもshellを経由しないargvを使う。pnpm.cmdを直接起動する代わりにnodeと実体のJSパスを指定する。チェックはローカルの許可済みコマンドだけ登録する。CLIはコマンドの安全性を判定しない。

実行ログはignoredなタスクディレクトリに保存し、既知の環境変数secretと代表的tokenをmaskする。完全なsecret検出ではない。秘密値を出すコマンド・引数を登録せず、ログを公開前に点検する。

## 契約と変更

ACは期待結果、IVは今回維持すべき挙動、TCは実行するチェック。controlsには認可拒否・データ互換性・復旧等、変更内容から必要な確認を追加する。各要求にchecksまたは具体的manual確認方法を持たせる。Riskスコアと全観点の適用外記入は廃止し、必要なControlと理由に集中する。

契約更新は理由を付ける。

~~~sh
node scripts/task-loop.mjs contract issue-123 .loop/state/issue-123/contract.json "追加指示に対応"
~~~

environmentにはlocal/preview等と非秘密の環境revisionを記入する。接続先・設定・fixture等が変わったら更新する。CLIは外部サービスの変化を自動観測しない。

初版は内容・契約・実行条件が変われば証拠を全失効させる。HEADが同じでも未コミット変更を検出する。履歴は保持するが、安全な依存関係の判定が未実装なので差分単位の自動再利用は行わない。チェック自身がソースを生成・整形した場合も再確認が必要。ignoredな成果物の生成は対象外。

## セルフレビューと指摘

templates/review.example.jsonをタスクディレクトリへコピーする。元Issueと契約の突き合わせ、差分の要求対応、検証の妥当性、manual結果を記録する。

レビュー深度はレビュー直前に実際の差分で判定する。契約時の予測ではなく `git diff` の実測値を使い、4軸（blast_radius / data_security / reversibility / uncertainty）と floor_triggers を評価して `applied_tier`（T1/T2/T3）を決める。語彙とティアの要求は `.loop/process.yaml` `review_depth` と `skills/code-review/SKILL.md` が正本。CLIは構造と「applied_tierが評価の示すフロアを下回らない」ことだけを検証し、レビューの質そのものは保証しない。内容が変わったら判定をやり直す。

~~~sh
node scripts/task-loop.mjs review issue-123 .loop/state/issue-123/review.json
node scripts/task-loop.mjs finding issue-123 .loop/state/issue-123/finding.json
~~~

findingは id / description / status / evidence を持つJSON。statusはopen/resolved/not_applicable。IDを維持し、修正の確認か不成立の根拠を記録してから閉じる。protected findingの受け入れや未実施必須チェックのPASS化に使わない。

reviewは判断の申告。独立レビューの証明ではない。サブエージェントは明示依頼時のみ。外部レビュー指摘を収集するadapterは未実装なので、PR全指摘の確認はmanual Controlとして契約へ含める。収集をしていない状態を「指摘なし」と扱わない。

## 引き渡し

~~~sh
node scripts/task-loop.mjs finish issue-123 https://github.com/OWNER/REPO/pull/123
~~~

local_verifiedはURL不要。pr_createdは公開先と最新HEADの一致まで。merge_readyはGitHub状態と全報告チェックを保守的に確認する。必要なチェックが未設定のrepoで品質保証を追加するものではない。required checks・承認の正本はGitHub設定。

PR作成・pushはCLIの外で許可範囲に従って実行する。finishはread-onlyのGitHub観測とローカル記録だけ。後から変更したらstatus/finishを再実行し、過去のcompleteを現在の完了として流用しない。

## 保証と境界

状態はJSON、CLIがatomicに更新する。contractの入力形はvalidateContractで検査する。状態全体の改竄検出、並列writer、永続サービス、外部環境自動追跡は対象外。単独writerを前提とする。CLIのファイルをAstraが変更可能なため、迂回不能な安全境界ではない。

CIは実テストとbranch protectionで外側の条件を保証する。ignoredな個人状態をCIへ持ち込まない。タスク状態をforce-addした場合はCLIが証拠の取得・完了を拒否する。旧ループの実行ファイルとテンプレートは削除済みで、新タスクはinitから開始する。

## 評価と改善

v12のRisk数値スコア・ライフサイクル（ratchet/降格規則）・独立review必須・全レビュー指摘のLearning候補化はv13では使わない。レビュー深度はprocess.yaml `review_depth` の定性軸とfloor_triggersをレビュー直前の実差分へ適用して決める（点数なし・一回判定）。保持するのは受入条件と維持条件の証明、指摘の全件処理、最新PR確認、作業分離、本番操作の承認。

過去の文書・学習記録はGit履歴で参照できる。pending CIでの誤完了、古い証拠、指摘脱落、rename、不要な再試行に対して試す。Learningは反復失敗・明確な制御不足・ユーザー依頼時に最大限具体化し、通常タスクのDONE条件にはしない。改善が依頼範囲外なら同じPRに混ぜない。

Astraのmodel/effortは実行環境で設定する。文書では切り替えられない。ロード済みcontextを消せるとは仮定せず、再開時はstatusと契約を読む。元要求との照合に必要な再読は許す。
