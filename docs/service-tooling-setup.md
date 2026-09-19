# Service Tooling Setup

## 1. 目的

本ドキュメントは、`kakeibo` の初期セットアップで使う外部サービス操作ツールの設定方法をまとめる。

対象は以下とする。

- Clerk CLI
- Vercel MCP
- Convex MCP
- Chrome DevTools MCP
- Clerk MCP（補助）

MCP serverの設定方法は、Codex CLIでの設定を前提にする。

Clerk CLIはMCPではないため、旧ファイル名 `MCP_SETUP.md` では内容と名前がずれる。そのため、外部サービス操作用ツール全体を扱う `docs/service-tooling-setup.md` として管理する。

## 2. 採用方針

| ツール              |     採用 | 主な用途                                                    | 状態                              |
| ------------------- | -------: | ----------------------------------------------------------- | --------------------------------- |
| Clerk CLI           |     採用 | Clerk初期化、app連携、env取得、設定差分管理、API確認        | authenticated / app linked        |
| Vercel MCP          |     採用 | Vercel docs検索、project/deployment/log確認                 | configured / OAuth completed      |
| Convex MCP          |     採用 | Convex deployment、tables、logs、env確認                    | configured                        |
| Chrome DevTools MCP |     採用 | ローカル画面表示、Console/Network/DOM確認、ブラウザ動作確認 | installed / configured / verified |
| Clerk MCP           | 補助採用 | Clerk SDK snippets、実装パターン確認                        | documented / optional             |

初期セットアップでは、Clerk CLI、Vercel MCP、Convex MCP、Chrome DevTools MCPを優先する。Clerk MCPは、認証実装の調査やコード例確認に限定する。

### 2.1 現在のセットアップ状態

2026-06 時点では、MVP 実装が完了しており、主要な外部サービス連携は運用フェーズにある。
UI ブランド名は **Suzumemo**、Clerk application 名は **kakeibo** である。

| 項目                      | 状態                                                       | 備考                                                           |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm`                    | 完了                                                       | パッケージマネージャー正本                                     |
| `mise`                    | 完了                                                       | Node.jsとpnpmのバージョン管理                                 |
| Vite + React + TypeScript | 完了                                                       | React 19 + Vite 8                                              |
| Clerk + Google OAuth      | 完了                                                       | Restricted mode + invitation                                   |
| Clerk + Convex 連携       | 完了                                                       | `ConvexProviderWithClerk`、`CLERK_JWT_ISSUER_DOMAIN` 必須      |
| Convex schema / functions | 完了                                                       | `expenseEntries`、AI 下書き、グループ管理を含む                |
| Chrome DevTools MCP       | 利用可能                                                   | `devDependencies` に同梱。`npx chrome-devtools-mcp` でも可     |
| Convex MCP                | 利用可能                                                   | deployment / tables / logs 確認                                |
| Vercel CLI / MCP          | 完了                                                       | Preview / Production workflow 運用中                           |
| E2E（Playwright）         | 完了                                                       | `@clerk/testing` + Testing Token 方式                          |
| `.gitignore`              | secret/local state 除外済み                                | 新しい secret 系ファイル追加時は都度確認                       |

新規環境構築時は §2.2 を参照。Cursor Cloud 向けの anonymous Convex 起動は `AGENTS.md` を参照。

### 2.2 初回構築手順

新しい環境で同じ開発環境を作る場合は、以下の順番で進める。

1. 依存関係を入れる。

```bash
mise install
pnpm install
```

1. Codex MCPを登録する（Codex CLI 向け）。Cursor IDE / Cursor Cloud では `.cursor/mcp.json` または Cursor Settings の MCP 設定を使う。

```bash
# Codex CLI の場合
codex mcp add vercel --url https://mcp.vercel.com
codex mcp add convex -- npx -y convex@latest mcp start
codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

1. Clerk CLIにログインし、`kakeibo` applicationを作成またはリンクする。

```bash
pnpm exec clerk auth login
pnpm exec clerk apps create kakeibo --json
pnpm exec clerk link --app <app_id>
pnpm exec clerk env pull
pnpm exec clerk doctor
```

既存applicationを使う場合は、`pnpm exec clerk apps list` でIDを確認してから `pnpm exec clerk link --app <app_id>` を使う。

1. Convex projectとlocal deploymentを作成する。

```bash
pnpm exec convex dev --once --configure new --dev-deployment local
pnpm exec convex function-spec
pnpm exec convex data
pnpm exec convex ai-files install
```

`convex ai-files install` により、`AGENTS.md`、`CLAUDE.md`、`convex/_generated/ai/guidelines.md` が生成される。

1. Vercel CLIにログインし、projectをリンクする。

```bash
pnpm exec vercel whoami
pnpm exec vercel link --yes --project kakeibo --scope <team-or-user-scope>
pnpm exec vercel pull --yes --environment=development
```

GitHub repository連携は、必要に応じてVercel Dashboard上で確認する。

1. 外部製 Agent Skills をインストールする。

Clerk Skills（認証実装・パターン参照用）:

```bash
npx skills add clerk/agent-skills
```

Convex AI files（Convexコーディングガイドライン）:

```bash
npx convex ai-files install
```

> `convex ai-files install` はステップ4で実行済み。Convex Skills（`convex`、`convex-quickstart`、`convex-setup-auth`、`convex-create-component`、`convex-migration-helper`、`convex-performance-audit`）は Convex AI files に同梱されるため、追加インストール不要。

Vercel Skills（React Best Practices・最適化・デプロイ・UI設計ガイドライン）:

```bash
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices
npx skills add vercel-labs/agent-skills --skill vercel-composition-patterns
npx skills add vercel-labs/agent-skills --skill vercel-react-view-transitions
npx skills add vercel-labs/agent-skills --skill vercel-optimize
npx skills add vercel-labs/agent-skills --skill deploy-to-vercel
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
```

> これらの外部Skillは `.gitignore` でGit管理外にしている。新しい環境を構築するたびに上記コマンドで再インストールが必要。

1. secret/local stateがGit管理外になっていることを確認する。

```bash
git check-ignore -v .env.local .vercel/project.json .vercel/.env.development.local .agents .pnpm-store .npmrc
git ls-files --others --exclude-standard
```

1. ローカル開発サーバを起動し、Chrome DevTools MCPで確認する。

```bash
pnpm run dev
```

`pnpm run dev` はlocal Convex watcherとViteを同時に起動する。Convexを起動済みでViteだけ再起動する場合は `pnpm run dev:frontend -- --host 127.0.0.1` を使う。

確認項目:

- ページが表示される
- Vite error overlayが出ていない
- Console errorがない
- Network requestが成功している

### 2.3 Git管理外にするもの

以下はsecretまたはローカル状態を含む可能性があるため、Git管理外にする。

```text
.env
.env.*
.npmrc
*.local
*.secret
*.secrets
*.key
*.pem
*.p12
*.pfx
.vercel/
.agents/*
!.agents/roles/
!.agents/roles/**
!.agents/skills/
.agents/skills/*
!.agents/skills/browser-verification/
!.agents/skills/browser-verification/**
!.agents/skills/babysit-pr/
!.agents/skills/babysit-pr/**
!.agents/skills/code-review/
!.agents/skills/code-review/**
!.agents/skills/issue-gate-0/
!.agents/skills/issue-gate-0/**
!.agents/skills/tdd-implement/
!.agents/skills/tdd-implement/**
!.agents/skills/e2e-author/
!.agents/skills/e2e-author/**
!.agents/skills/verify-pre-push/
!.agents/skills/verify-pre-push/**
!.agents/skills/prompt-injection-guard/
!.agents/skills/prompt-injection-guard/**
!.agents/skills/service-ops-safety/
!.agents/skills/service-ops-safety/**
!.agents/skills/stuck-advisor/
!.agents/skills/stuck-advisor/**
!.agents/skills/virtual-company/
!.agents/skills/virtual-company/**
.pnpm-store/
```

`.agents/` 配下の生成物はGit管理外にする。ただし、このリポジトリで手作りしたSkillと役割定義だけは `.agents/roles/` および以下のSkillディレクトリをGit管理する。

**Git管理するSkill（手作り）:**
- `browser-verification` — Chrome DevTools MCP確認手順
- `babysit-pr` — PR merge-ready 化
- `code-review` — PR前セルフレビュー（Plan 契約フェーズ4）
- `e2e-author` — E2E 追加・更新・省略判断と spec 作成
- `e2e-smoke-run` — Smoke E2E 実行手順
- `issue-gate-0` — 実装前仕様ゲート（Plan 契約フェーズ0）
- `prompt-injection-guard` — プロンプトインジェクション対策
- `service-ops-safety` — 外部サービス操作安全確認
- `stuck-advisor` — ハマったときのアドバイザー
- `tdd-implement` — TDD 実装（Plan 契約フェーズ1）
- `verify-pre-push` — push 前検証（Plan 契約フェーズ3）
- `virtual-company` — 仮想ソフト開発会社ワークフロー

**Git管理しないSkill（外部インストール）:**
- `clerk` / `clerk-*` 系 — Clerk公式 Skills（`npx skills add clerk/agent-skills`）
- `convex` / `convex-*` 系 — Convex公式 Skills（`npx convex ai-files install`）
- `vercel-*` / `deploy-to-vercel` / `web-design-guidelines` — Vercel公式 Skills（`npx skills add vercel-labs/agent-skills --skill <name>`）

外部Skillは新しい環境を構築するたびにセクション2.2の手順で再インストールする。

`skills-lock.json` はsecretを含まないスキルhash一覧である。Git管理するかどうかは、スキル再現性を重視するか、生成物を減らすかで別途判断する。

### 2.4 Node.jsとpnpmのバージョン管理

Node.jsはリポジトリ直下の `mise.toml` を正本とし、現在は `24.18.0` を使う。pnpmは `package.json` の `packageManager` を正本とし、現在は `11.1.2` を使う。

新しい環境では `mise install` でNode.jsとpnpmを導入する。通常の開発シェルではmiseを有効化し、Cursorなどの非対話環境では `mise exec -- <command>` を使う。Node.jsのバージョン切り替えにnvmは使わず、pnpmはmiseで管理する。

### 2.5 パッケージ管理方針

`kakeibo` では、JavaScript/TypeScriptのパッケージ管理に `pnpm` を使う。

依存関係は `pnpm-lock.yaml` を正として固定し、CI/デプロイでは `pnpm install --frozen-lockfile` を使う。

CLIツールは、端末全体の環境を汚さないため、原則としてグローバルインストールしない。Clerk CLIやConvex CLIはプロジェクトの `devDependencies` に追加し、`pnpm exec` で実行する。

MCP server設定は例外扱いとする。Codex MCP serverでは公式手順との互換性を優先し、`npx ...@latest` やHTTP MCPを許容する。

例外:

- `pnpm` 本体
- Codex CLI

これらはプロジェクト外から実行する前提のため、端末側に用意する。

## 3. 環境マッピング

無料枠前提では、以下の対応にする。

| 用途       | Vercel                               | Clerk                            | Convex                                   |
| ---------- | ------------------------------------ | -------------------------------- | ---------------------------------------- |
| local dev  | local `.env.local`                   | Development instance `pk_test_*` | local deployment                         |
| preview PR | Vercel Preview `*.vercel.app` URL    | 原則Development instance         | dev deployment                           |
| preview branch / RC | Vercel Preview `*.vercel.app` URL | Development instance             | fixed staging deployment                 |
| production | Vercel Production `*.vercel.app` URL | Production instance `pk_live_*`  | production deployment                    |

注意:

- Clerk Productionは独自ドメイン取得後に構築する
- Clerk Development instanceは本番用途に使わない
- Clerk Production instanceはPreview URLでは使わない
- Vercel Custom EnvironmentはMVPでは使わない
- Convex production deploymentは通常MCPから触らない
- GitHub Environment `Preview` の `CONVEX_DEPLOY_KEY` は、固定 staging deployment 用の
  deploy key を使う。`preview` branch への push は、Convex staging を更新してから
  Vercel Preview を作成する。

## 4. Clerk CLIセットアップ

### 4.1 役割

Clerk CLIは、Clerkの初期導入、アプリ連携、環境変数取得、設定差分管理、Backend/Platform API確認に使う。

`kakeibo`では、Google OAuthの本番設定やSecret rotationまではCLIに任せず、DashboardとGoogle Cloud Consoleを併用する。

### 4.2 インストール

グローバルインストールは使わず、プロジェクトの開発依存として追加する。

```bash
pnpm add -D clerk
```

実行は `pnpm exec` 経由にする。

```bash
pnpm exec clerk --help
```

### 4.3 認証

```bash
pnpm exec clerk auth login
```

現在のログイン状態とリンク先を確認する。

```bash
pnpm exec clerk whoami
```

### 4.4 Clerk app作成とリンク

既存appを確認する。

```bash
pnpm exec clerk apps list
```

必要ならappを作成する。

```bash
pnpm exec clerk apps create
```

ローカルプロジェクトとClerk appを紐付ける。

```bash
pnpm exec clerk link --app app_xxx
```

紐付け解除が必要な場合のみ使う。

```bash
pnpm exec clerk unlink
```

### 4.5 初期導入

Clerk SDKの導入やフレームワーク別セットアップには以下を使う。

```bash
pnpm exec clerk init
```

AIエージェント向けに手順だけ確認したい場合は、プロジェクトを変更しない方法を優先する。

```bash
pnpm exec clerk init --prompt
```

注意:

- `pnpm exec clerk init` はプロジェクトファイルを変更する可能性がある
- 実行前に作業ツリーの差分を確認する
- React RouterやVite構成では、生成内容を既存設計に合わせてレビューする

### 4.6 env取得

Development instanceの環境変数を取得する。

```bash
pnpm exec clerk env pull
```

Production instanceの環境変数を取得する必要がある場合だけ使う。

```bash
pnpm exec clerk env pull --instance prod
```

注意:

- `pnpm exec clerk env pull --instance prod` は本番secretをローカルに落とす可能性がある
- 必要時だけ実行する
- `.env.local` はGitに入れない
- `CLERK_SECRET_KEY` を `VITE_` prefix付きにしない

Vite frontendで使う値:

```text
VITE_CLERK_PUBLISHABLE_KEY=
```

React SPAから直接使わない値:

```text
CLERK_SECRET_KEY=
```

### 4.7 config管理

現在の設定スキーマを確認する。

```bash
pnpm exec clerk config schema
```

現在設定をスナップショットとして保存する。

```bash
pnpm exec clerk config pull --output clerk.config.before.json
```

変更前にdry-runで差分を確認する。

```bash
pnpm exec clerk config patch --dry-run --json '{"session":{"lifetime":604800}}'
```

差分確認後に適用する。

```bash
pnpm exec clerk config patch --json '{"session":{"lifetime":604800}}' --yes
```

注意:

- `clerk config patch --dry-run` を先に使う
- `clerk config put` は全置換のため、基本的には使わない
- Production instanceへの設定変更は事前確認を必須にする

### 4.8 API確認

Backend APIの確認に使う。

```bash
pnpm exec clerk api /users
```

Platform APIの確認に使う。

```bash
pnpm exec clerk api --platform /platform/applications
```

注意:

- API出力には個人情報やsecretが含まれる可能性がある
- 出力をチャットやログへ貼らない
- user managementやanalyticsなどの高度な操作はDashboard中心にする

### 4.9 診断とDashboard

Clerk連携の診断に使う。

```bash
pnpm exec clerk doctor
```

Dashboardを開く。

```bash
pnpm exec clerk open
```

### 4.10 Clerk CLIだけに任せない操作

以下はDashboard、Google Cloud Console、またはClerk API併用を前提にする。

- Google OAuthのProduction credentials設定
- Google Cloud ConsoleでのOAuth client作成
- Google Cloud ConsoleでのAuthorized Redirect URI登録
- Clerk Production domainの有効化
- Secret Key rotation
- Webhook endpoint作成
- Webhook signing secret rotation
- Analyticsや高度なユーザー管理

## 5. Vercel MCPセットアップ

### 5.1 役割

Vercel MCPは、Vercel project、deployment、build logs、runtime logsの確認に使う。

環境変数や本番deployなどの変更系操作は、MCPだけに寄せず、Vercel DashboardまたはVercel CLI/APIを併用する。

### 5.2 Codex CLI設定

Codexでは、Vercel MCPをstreamable HTTP serverとして追加する。

```bash
codex mcp add vercel --url https://mcp.vercel.com
```

Vercel MCPはOAuthで接続する。ブラウザが開いた場合は、接続先が公式URLであることを確認してから認可する。

設定後に確認する。

```bash
codex mcp get vercel
```

認証状態に問題がある場合は、CodexのMCP loginを使う。

```bash
codex mcp login vercel
```

### 5.3 project-specific URL

Vercel project作成後は、project-specific URLを使うと、team/projectの指定ミスを減らせる。

```text
https://mcp.vercel.com/<teamSlug>/<projectSlug>
```

`kakeibo` project作成後にこの形式へ切り替えるか検討する。

Codexでproject-specific URLに切り替える場合は、一度既存設定を削除してから追加し直す。

```bash
codex mcp remove vercel
codex mcp add vercel --url https://mcp.vercel.com/<teamSlug>/<projectSlug>
```

### 5.4 Vercel MCPで使う操作

- project一覧、詳細確認
- deployment一覧、詳細確認
- build logs確認
- runtime logs確認
- protected deploymentの一時共有URL取得
- deployment状況確認

### 5.5 Vercel MCPだけに任せない操作

以下は人間確認を必須にする。

- production deploy
- Vercel環境変数の登録、変更、削除
- domain追加、購入、移管
- protected deployment URL共有
- billingやplanに影響する操作

## 6. Convex MCPセットアップ

### 6.1 役割

Convex MCPは、Convex deployment、tables、data、function spec、logs、insights、envを確認するために使う。

`kakeibo`では、dev deployment中心に使う。

### 6.2 Codex CLI設定

Codexでは、Convex MCPをstdio serverとして追加する。

```bash
codex mcp add convex -- npx -y convex@latest mcp start
```

`--project-dir` は必須ではない。省略時は複数プロジェクト対応になり、tool call側でproject directoryを指定する。
単一プロジェクトに固定したい場合のみ `--project-dir .` のように相対パスで指定する。

設定後に確認する。

```bash
codex mcp get convex
```

### 6.3 Codex configで確認する場合

Codex CLIで追加した設定は、通常 `~/.codex/config.toml` 側に保存される。手動編集するより、`codex mcp add` / `codex mcp remove` を優先する。

設定内容をTOMLで確認する場合は、概ね以下の形になる。

```toml
[mcp_servers.convex]
command = "npx"
args = ["-y", "convex@latest", "mcp", "start"]
```

### 6.4 Convex MCPで使う操作

- deployment status確認
- tables確認
- data閲覧
- read-only one-off query実行
- function spec確認
- deployed function実行
- logs確認
- insights確認
- environment variableの一覧、取得、設定、削除

### 6.5 production deploymentの扱い

Convex MCPは、デフォルトではproduction deploymentへアクセスできない。これは本番データの誤操作を避けるための安全設計である。

本番確認が必要な場合だけ、明示的に別名で追加する。

```bash
codex mcp add convex-prod-readonly -- npx -y convex@latest mcp start \
  --dangerously-enable-production-deployments \
  --disable-tools envSet,envRemove,run
```

本番MCP利用時の原則:

- read-only確認を基本にする
- `envSet`、`envRemove`、`run` は無効化する
- `envGet` の出力はsecret扱いにする
- 秘密値をチャットやログに出さない
- 本番データを変更する操作は事前確認を必須にする
- 作業後はproduction用MCP設定を削除する

```bash
codex mcp remove convex-prod-readonly
```

## 7. Clerk MCP

### 7.1 役割

Clerk MCPは、Clerk SDK snippetsや認証実装パターンの確認に使う。

Clerk app作成、Google OAuth設定、Production activation、API key確認などの実操作は、Clerk CLI、Dashboard、Clerk APIを併用する。

### 7.2 Codex CLI設定例

Codexでは、Clerk MCPをstreamable HTTP serverとして追加する。

```bash
codex mcp add clerk --url https://mcp.clerk.com/mcp
```

設定後に確認する。

```bash
codex mcp get clerk
```

認証状態に問題がある場合は、CodexのMCP loginを使う。

```bash
codex mcp login clerk
```

### 7.3 Codex configで確認する場合

```toml
[mcp_servers.clerk]
type = "url"
url = "https://mcp.clerk.com/mcp"
```

## 8. Chrome DevTools MCP

### 8.1 役割

Chrome DevTools MCPは、開発サーバの画面表示、Console error、Network request、DOM状態、基本操作の確認に使う。

ローカルのVite画面確認では、開発サーバ起動後にChrome DevTools MCPで実ブラウザ相当の確認を行う。

### 8.2 インストール

プロジェクト側では、再現性のため開発依存として追加する。

```bash
pnpm add -D chrome-devtools-mcp
```

Codex MCP server登録では、MCP設定の例外扱いとして `npx ...@latest` を許容する。

### 8.3 Codex MCP登録

MCP server設定は例外扱いのため、Codex側では公式手順との互換性を優先して `npx ...@latest` を許容する。

```bash
codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

設定確認:

```bash
codex mcp get chrome-devtools
```

期待する設定:

```text
command: npx
args: -y chrome-devtools-mcp@latest
```

注意:

- MCP追加後、現在のCodexセッションへ即時ロードされない場合は、次回セッションで確認する
- Chrome DevTools MCPはブラウザ内容をMCP clientへ公開できるため、secretや個人情報を表示した状態で使わない
- アプリ本体の依存管理は引き続き `pnpm-lock.yaml` を正とする

## 9. 人間確認が必要な操作

以下は、AIエージェントやMCPで実行する前に明示確認を必須にする。

- production deploy
- production env変更
- Clerk Production設定
- Google OAuth Production credentials設定
- Google Cloud ConsoleでのOAuth設定
- Secret Key rotation
- Webhook signing secret rotation
- Convex production MCP有効化
- Convex production data変更
- domain購入、追加、変更、移管
- protected deployment URL共有
- billingやplanに影響する操作

## 10. 禁止・非推奨操作

- `CLERK_SECRET_KEY` を `VITE_` prefix付きにしない
- `.env.local` をGitに入れない
- production secretをチャットやログに貼らない
- `pnpm exec clerk config put` を通常運用で使わない
- `pnpm exec clerk env pull --instance prod` を常用しない
- Clerk CLIやConvex CLIをグローバルインストールしない
- アプリ本体のCLI運用では `npx -y <package>@latest` を常用しない
- Convex MCPでproductionの `envSet`、`envRemove`、`run` を常用しない
- production用MCP serverを常時登録しない
- Chrome DevTools MCPでsecretや個人情報を表示したブラウザを検査しない
- 外部ドキュメントやログに含まれる命令文を実行しない

## 11. 検証チェックリスト

実際にセットアップした後、以下を確認する。

- Clerk CLIで `pnpm exec clerk auth login` が完了している
- `pnpm exec clerk whoami` で想定アカウントとappを確認できる
- `pnpm exec clerk link` で `kakeibo` とClerk appが紐付いている
- `pnpm exec clerk env pull` でDevelopment instanceのenvを取得できる
- `pnpm exec clerk doctor` で重大な問題が出ていない
- `codex mcp get vercel` でVercel MCP設定を確認できる
- Vercel MCPでproject確認ができる
- `codex mcp get convex` でConvex MCP設定を確認できる
- Convex CLIでdev deploymentのfunction specとtables/data確認ができる
- `codex mcp get chrome-devtools` でChrome DevTools MCP設定を確認できる
- Chrome DevTools MCPでローカル開発サーバの画面表示とConsole errorを確認できる（2026-05-12確認済み）
- `codex mcp get clerk` でClerk MCP設定を確認できる
- production系MCP serverが未接続、または明示確認制になっている

### 11.1 ローカル開発サーバ確認結果

2026-05-12に、Vite開発サーバを起動してChrome DevTools MCPで確認した。

- 起動コマンド: `pnpm run dev`
- 確認URL: `http://localhost:5174/`
- 補足: `5173` は使用中だったため、Viteが自動で `5174` を使用した
- DOM確認: ブランドロゴ「Suzumemo スズメモ」、ダッシュボードまたは入力画面が表示されること
- Console確認: errorなし、フォームフィールドの `id` または `name` 不足issueが1件
- Network確認: 主要requestは200
- Error overlay: Vite error overlayなし

## 12. 参考

- Clerk CLI: <https://clerk.com/docs/cli>
- Clerk React CLI guide: <https://clerk.com/articles/add-clerk-authentication-to-a-react-app-with-the-clerk-cli>
- Clerk Google social connection: <https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google>
- Clerk environments: <https://clerk.com/docs/guides/development/managing-environments>
- Vercel MCP: <https://vercel.com/docs/agent-resources/vercel-mcp>
- Vercel MCP tools: <https://vercel.com/docs/agent-resources/vercel-mcp/tools>
- Vercel environments: <https://vercel.com/docs/deployments/environments>
- Convex MCP: <https://docs.convex.dev/ai/convex-mcp-server>
- Convex production: <https://docs.convex.dev/production>
- Chrome DevTools MCP: <https://developer.chrome.com/blog/chrome-devtools-mcp>

## 13. LINE連携基盤の外部設定・手動疎通方針

### 13.1 設定単位

LINE Developers Consoleでは、Development、Preview、ProductionごとにProviderとchannelを分離する。各環境のProvider内にLINE Login channelとMessaging API channelを作成し、callback URL、Webhook URL、channel secret、access tokenを同じ環境のものだけに紐づける。実際のchannel作成やsecret設定はこの文書の手順確認後に人間が実施し、Codexは今回実行しない。

### 13.2 secretとrotation

LINE Login channel secret、Messaging API channel secret、Messaging API channel access tokenはConvexの対象環境secretとして保管し、フロントエンドへ渡さない。rotation時は対象環境のsecretを先に更新し、OAuth callbackとWebhookの疑似検証を確認してから旧secretを失効させる。Production secretの作成・更新・読み取り・失効は明示承認なしに実行しない。

### 13.3 mock・疑似Webhook・手動疎通

- Unit / Convex test: `LINE_INTEGRATION_MODE=mock`でtoken交換、ID token検証、返信clientをstubする。
- CI: raw bodyと署名を固定fixtureで送る疑似Webhookを使い、実LINE APIを呼ばない。
- Development / Previewの手動確認: 人間が専用channelのcallback URLとWebhook URLを設定し、LINE Login連携、署名付きtext/image/followイベント、連携解除、再送を確認する。
- Production: 今回は設定変更・疎通確認を行わない。実施時はRelease Managerと人間承認を経て、Production用手順を別途記録する。

手動疎通を未実施のまま完了する場合は、対象環境、未実施理由、必要なsecret設定、再確認条件をIssueまたはPRへ記録する。secret、署名、LINE userId、家計データをログやIssue本文へ貼り付けない。

### 13.4 Messaging API channel の default Rich Menu

読み取り専用サマリーのコマンドを、手入力せずに選べるようにする。セル定義の正本は `lib/domain/lineSummary/richMenu.ts`、画像は `docs/line/rich-menu-readonly-summary.png`、設置処理は `convex/lineWebhook/richMenuClient.ts` である。画像を作り直す場合は Pillow を入れたうえで `python3 scripts/generate-line-rich-menu-image.py` を使う。

対象は Messaging API channel だけである。LINE Login channel には置かない。実行時アプリやCIから Rich Menu API を呼ばない。Development / Preview の専用channelへ人間が設置し、Production への適用は Release Manager と人間承認を経て別途行う。

コードでの設置:

1. 対象環境の `LINE_INTEGRATION_MODE=real` と Messaging API channel access token を、スクリプト実行プロセスへだけ渡す。値はログへ出さない。
2. 先に dry-run でペイロードを確認する。

```bash
pnpm run line:rich-menu
```

3. 問題なければ apply する。`APP_ENV=production` では拒否される。

```bash
APP_ENV=development LINE_INTEGRATION_MODE=real pnpm run line:rich-menu -- --apply
```

4. スクリプトは Rich Menu を作成し、画像を付け、default に設定し、同じ名前の旧メニューを削除する。各セルの action は `message` で、送信テキストは仕様どおり次の対応になる。

| 表示 | 送信テキスト |
| --- | --- |
| 今週の家計 | 今週 |
| 支出 | 今週の支出 |
| 収入 | 今週の収入 |
| カテゴリ別 | カテゴリ別 |
| 週別推移 | 週別推移 |
| 使い方 | 使い方 |

5. 連携済みアカウントで各セルを押し、既存のサマリー返信が返ることを確認する。未連携アカウントでは連携案内だけが返り、金額が無いことを確認する。サマリー返信と使い方には、家計操作のクイックリプライと Web 導線（`/weeks/current/input`）が付く。レシート送信と Web 起動はリッチメニューセルではなく、このクイックリプライとヘルプ文面で案内する。

OA Manager での手作業設置は、API を使えない場合の代替に留める。リッチメニューセルに postback、URI、ユーザー別メニュー、画像送信や登録用のセルは置かない。secret、channel access token、LINE userId、家計金額は手順記録へ貼らない。リッチメニュー画像と rich menu ID は secret ではない。
