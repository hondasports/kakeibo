# Astra Issue Loop v13

契約・差分・証拠を使い、通常順序を短く保つ。Astraは仕様と検証の妥当性を判断し、CLIは実行結果・古い証拠・完了地点を検査する。AGENTS.mdを入口とする。

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

CIは実テストとbranch protectionで外側の条件を保証する。ignoredな個人状態をCIへ持ち込まない。旧check-loop-evidence.mjsは既存consumerの互換性のため残すが、v13の完了には使用しない。旧YAML stateは履歴として残せるが自動変換しない。

## 移行と評価

v12のRisk floor、独立review必須、全レビュー指摘のLearning候補化はv13では使わない。保持するのは受入条件と維持条件の証明、指摘の全件処理、最新PR確認、作業分離、本番操作の承認。

.loop/learningsの過去事例は評価資料。pending CIでの誤完了、古い証拠、指摘脱落、rename、不要な再試行に対して試す。Learningは反復失敗・明確な制御不足・ユーザー依頼時に最大限具体化し、通常タスクのDONE条件にはしない。改善が依頼範囲外なら同じPRに混ぜない。

Astraのmodel/effortは実行環境で設定する。文書では切り替えられない。ロード済みcontextを消せるとは仮定せず、再開時はstatusと契約を読む。元要求との照合に必要な再読は許す。
