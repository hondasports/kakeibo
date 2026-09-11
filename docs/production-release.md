# DEV / PREVIEW / PROD リリース手順

このドキュメントは、kakeibo のリリース経路を DEV / PREVIEW / PROD に分けて扱うための運用手順を定義する。

PROD 反映の正規ルートは `.github/workflows/production-release.yml` とし、`main` への push で自動起動する。
ただし、GitHub Environment `production` の承認後にだけ本番反映を行う。Actions 以外の Vercel Dashboard、Convex Dashboard、ローカル CLI からの直接 Production deploy は正規ルートにしない。

## 環境の役割

| 環境    | Vercel                         | Convex                         | Clerk                | 用途                         |
| ------- | ------------------------------ | ------------------------------ | -------------------- | ---------------------------- |
| DEV     | Local / 通常の Vercel Preview  | Development deployment         | Development instance | 日常開発、PR単位の確認       |
| PREVIEW | `preview` branch の Vercel Preview | fixed staging deployment       | Development instance | 統合確認、PROD候補確認 |
| PROD    | Vercel Production              | Production deployment          | Production instance  | 実ユーザー向け               |

PREVIEW は本番DBのコピーではない。Convex staging deployment は固定の非本番バックエンドとして扱い、PROD / DEV のデータや functions と混在させない。

## DEV から PREVIEW までの流れ

```text
PRをpreviewへmerge
  ↓
preview-deploy.yml が固定 staging Convex と Vercel Preview を更新
  ↓
PREVIEW URLで候補確認
  ↓
PRをmainへmerge
  ↓
production-release.yml が自動起動
  ↓
preflight後、GitHub Environment: production の承認待ち
  ↓
承認後にPRODへ反映
```

通常の PREVIEW デプロイは、`preview` branch への push で `preview-deploy.yml` が自動実行する。
## PREVIEW 確認の事前条件

- 対象変更が `preview` branch に merge 済みである。
- `preview-deploy.yml` が成功している。
- PREVIEW URLで必要な動作確認が完了している。
- `pnpm run lint`、`pnpm run format:check`、`pnpm test --run`、`pnpm run build` が成功する。
- DB/schema変更がある場合、代表データと migration/backfill 要否が説明できる。

## PREVIEW に必要な設定

GitHub Environment `Preview` に以下を設定する。

| 種類     | 名前                | 用途                                  |
| -------- | ------------------- | ------------------------------------- |
| Secret   | `VERCEL_TOKEN`      | GitHub Actions から Vercel CLI を実行する |
| Secret   | `CONVEX_DEPLOY_KEY` | 固定 Convex staging deployment へ反映する |
| Variable | `VERCEL_ORG_ID`     | Vercel project の所属ID               |
| Variable | `VERCEL_PROJECT_ID` | Vercel project ID                     |

`CONVEX_DEPLOY_KEY` は、固定 staging deployment 用の deploy key を設定する。
`preview-deploy.yml` は、この key で staging functions / schema を更新してから Vercel Preview を作成する。

Vercel Preview Environment には `VITE_CLERK_PUBLISHABLE_KEY` を Clerk Development instance の公開鍵で設定する。

Convex staging deployment には、少なくとも以下を設定する。

- `CLERK_JWT_ISSUER_DOMAIN`
- `CLERK_SECRET_KEY`
- `RECEIPT_IMAGE_EXTRACTOR_MODE=mock`
- `APP_ENV=development`

`OPENAI_API_KEY` は PREVIEW に設定しない。通常検証で実OpenAI APIを呼ばない。

## PROD 反映フロー

PREVIEW 環境をそのまま PROD へ向け替える運用にはしない。PREVIEW で検証した同じ commit / ref を、Production 環境へ再デプロイする。

```text
PREVIEWで検証したcommit/refを確定
  ↓
main への merge で production-release.yml が自動起動
  ↓
preflight（入力確認、APP_VERSION確定、lint、format、test、Product Update 生成、build、artifact保存）
  ↓
GitHub Environment: production の承認待ち
  ↓
承認後に artifact から生成済み Product Update を復元
  ↓
Convex Production へ反映
  ↓
Vercel Production へ反映
  ↓
PROD smoke checklist（title + app-version meta）
  ↓
GitHub Release `app-v{APP_VERSION}` と `product-updates.json` asset 作成
  ↓
Actions Summary に結果を残す
```

`production-release.yml` は、`main` への push と手動実行の両方を受け付ける。

`main` push では、merge commit の SHA を `source_ref` として扱い、
`preview -> main` のブランチ運用により PREVIEW 確認済みとみなす。
実際の Production 反映は GitHub Environment `production` の承認後にだけ実行される。

手動実行時の入力値:

| 入力 | 例 | 説明 |
| --- | --- | --- |
| `source_ref` | `main` | PREVIEWで検証済みの ref。`main` または `release/*` のみ |
| `preview_confirmed` | `true` | 同じ ref を PREVIEW で確認済みであることの明示確認 |
| `db_schema_change_check` | `no_db_or_schema_change` | DB/schema 変更なし、または forward-fix 前提の確認済みを選ぶ |
| `release_note` | `m15 PREVIEW URL確認済み` | PREVIEW evidence またはリリース意図の短いメモ |

`preflight` job は GitHub Environment `production` の承認前に実行される。`production` job には必ず `environment: production` を設定し、GitHub 側の required reviewers / prevent self-review / branch rule で承認を強制する。

## Production に必要な設定

`production-release.yml` は `permissions: contents: write` を必要とする。これにより `GITHUB_TOKEN` で GitHub Release と `product-updates.json` asset の読み書きが行える。

GitHub Environment `production` に以下を設定する。

| 種類     | 名前                   | 用途                                  |
| -------- | ---------------------- | ------------------------------------- |
| Secret   | `VERCEL_TOKEN`         | GitHub Actions から Vercel CLI を実行する |
| Secret   | `CONVEX_DEPLOY_KEY`    | Convex Production deployment へ反映する |

| Variable | `VERCEL_ORG_ID`        | Vercel project の所属ID               |
| Variable | `VERCEL_PROJECT_ID`    | Vercel project ID                     |
| Variable | `PRODUCTION_SMOKE_URL` | 任意。custom domain など smoke 対象を固定したい場合に設定 |

GitHub Environment `production` 側で設定するもの:

- Required reviewers を有効にする。
- Prevent self-review を有効にする。
- Deployment branch rule で `main` または許可した `release/*` branch だけに絞る。
- PROD 用の値は `production` environment にだけ置く。
- 必要に応じて Wait timer を設定する。

Convex Production deployment には Production 用の環境変数を設定する。`RECEIPT_IMAGE_EXTRACTOR_MODE=real` は `APP_ENV=production` とセットでのみ使う。

Vercel Production Environment には Clerk Production instance と Convex Production URL に対応する値だけを設定する。DEV/PREVIEW の `pk_test_*` / `sk_test_*` や Convex dev / preview URL は流用しない。

## Product Update 生成

`scripts/generate-product-updates.ts` は `Production preflight` Job で実行され、Production リリース時に次の順で Product Update を生成する。生成AIや専用APIキーは使わない。

**原稿の正本**: preview 向け PR 本文の `<!-- suzumemo-update:start -->` 〜 `<!-- suzumemo-update:end -->` マーカー内にある単一の `yaml` コードブロック。`publish: true` なら `category`（`feature` / `improvement` / `fix` / `performance` / `stability`）と `description`（ユーザー向け原稿、複数行は `|`）が必須、`publish: false` なら `reason`（非掲載理由）が必須。見出しや自由文の解釈は行わない。同じ解析・検証処理が PR 検証 CI（`.github/workflows/pr-update-spec.yml`）とこの生成処理で共有される。

1. 過去の `app-v*` GitHub Release から `product-updates.json` asset を取得し、既に公開済みの更新を得る。asset は有効な JSON で、リリース tag の `app-v{version}` と `version` が一致し、過去の更新間で `id` が重複しないことを検証する。
2. 収集範囲をコミット範囲で決定する。起点は前回リリースassetに保存された `sourceSha`、無ければ最新 `app-v*` release tag が指すコミット（対象コミットの祖先でない場合は merge-base を使う）。末端は `SOURCE_REF` を `git rev-parse --verify` で解決したコミットSHA。マージ日時によるPR検索には依存しない。
3. 範囲内の merge commit（`Merge pull request #N from ...`）と squash 取り込み（`... (#N)`）からPR番号を抽出し、head が `preview` / `release/*` / `main` の統合PRを除外する。各PRを GitHub API で取得し、`user.type == "Bot"` は記入例外として記録、それ以外のPRはマーカー内YAMLを検証する。
4. 掲載指定されたPRは `id: pr-{number}`、`title` = PRタイトル（conventional接頭辞は除去）、`summary` = `description`、`category` = `category` で下書き化する。`publish: false` は非掲載として理由とともに記録する。
5. `src/content/product-updates.ts` の手動ドラフトとID単位で統合する（同一IDは手動優先）。
6. 過去の更新と重複しないことを確認し、`src/generated/product-updates.json` と `.tmp/product-updates.current-release.json` を出力する。Release assetには `sourceRef` / `sourceSha` / `sourceMergedAt` と、対象PRごとの掲載・非掲載・例外判定（`pullRequestDecisions`）を保存する。
7. 掲載予定内容と元PR対応・非掲載理由をActions Summaryへ出力する。掲載0件の場合も理由を確認できる。生成物は artifact 経由で `Deploy Production` Job へ受け渡され、environment 承認前に内容を確認できる。

**エラー方針:** `SOURCE_REF` のSHA解決失敗・GitHub API失敗・範囲内PRのマーカー欠落や不正はすべてエラーで中断する。「変更なし」への黙った変換はしない。マージ済みPRにマーカーが無い場合の回収は、当該PR本文を編集してマーカーを追記するか、`src/content/product-updates.ts` に手動draftを追加する。

**PR紐付けの方式:** PR番号は `commits/{sha}/pulls`(GitHub が記録したマージ済みPR)と merge commit の件名から取得する。squash / rebase / merge commit いずれの取り込み方式にも対応できる。件名中の `(#NNN)` は Issue 参照のことがあるためPR番号としては使わない。ただし default branch(`preview`)に存在しないコミット(mainへの直接hotfix等)はマージ済みPRを返さないため「PRに紐付かないコミット」エラーになる。その場合は変更を preview へ戻して通常のPR経路に乗せるか、手動draftで掲載原稿を補う。

**運用メモ:** 取り消したい変更(revert等)が範囲に含まれる場合は、対象PR本文を `publish: false` に修正するか、同一IDの手動draftで上書きする。過去の `app-v*` リリースが一度も無い初回実行では収集対象0件として扱い、その旨をSummaryへ記録する。

手動で内容を調整したい場合は `src/content/product-updates.ts` に `id` を `pr-{number}`（例: `pr-459`）または `prs-{number}-{number}`（例: `prs-459-460`）で指定するか、新規の `id` を追加する。

## DB/schema変更時のチェックリスト

- schema変更内容を PR または Issue に明記する。
- 既存データとの互換性を確認する。
- migration / backfill の要否を判断する。
- 旧schema相当、新schema相当、optional field 欠損を含む代表データで確認する。
- `groupId` あり/なし、owner/member 混在など、認可境界に関わるデータを確認する。
- PROD反映前提の rollback に頼らず、forward-fix 方針を確認する。
- `production-release.yml` の `db_schema_change_check` は、変更なしなら `no_db_or_schema_change`、変更ありなら `reviewed_forward_fix_plan` を選ぶ。

## PREVIEW smoke checklist

- GoogleログインまたはE2E認証でアプリへ入れる。
- グループ未所属 / 所属済みの導線が破綻しない。
- レシート登録、編集、削除ができる。
- 週次サマリーが表示される。
- 設定保存ができる。
- レシート画像抽出は mock mode として動作し、実OpenAI APIを呼ばない。
- Convex / Clerk / Vercel の接続先が DEV / PROD と混在していない。

## PROD smoke checklist

初期の PROD smoke は非破壊確認に限定する。Production データの作成、更新、削除を自動テストで行わない。

- `production-release.yml` が Vercel Production deployment URL または `PRODUCTION_SMOKE_URL` へ `Cache-Control: no-cache` 付きで HTTP GET を行い、キャッシュを再検証する。
- 取得したHTMLの `<title>` が、デプロイ対象refの `index.html` と一致することを確認する。これにより、Production aliasやCDNが旧HTMLを返した場合はリリースを失敗させる。
- 取得したHTMLの `<meta name="app-version" content="...">` が、`APP_VERSION` 環境変数と一致することを確認する。これにより、Vercel Production ビルドに `VITE_APP_VERSION` が正しく注入されたかを再検証する。
- Previewや通常のブラウザアクセスに対するレスポンスヘッダーは変更せず、既存のブラウザキャッシュを利用する。
- Clerk Production のサインイン画面またはアプリ shell が表示可能であることを手動確認する。
- Convex / Clerk / Vercel の接続先が PROD 用であり、DEV/PREVIEW と混在していないことを確認する。
- 主要CRUDなどデータ変更を伴う確認は、自動 smoke ではなくリリース後の手動確認として必要最小限で行う。

## 直接 Production deploy の扱い

Actions で防ぐこと:

- 承認なしの PROD deploy
- `main` / 許可 branch 以外からの PROD deploy
- test / lint / build 未通過の PROD deploy
- PREVIEW 未確認の PROD deploy
- DB/schema 変更チェック未記入の PROD deploy
- PROD 反映 workflow の二重実行
- PROD 用の値が DEV/PREVIEW に流れること

Actions だけでは防ぎにくいこと:

- Vercel Dashboard からの直接 Production deploy
- Vercel Git Integration による main push 時の自動 Production deploy
- ローカル端末からの直接 Production deploy
- Convex / Vercel / Clerk の管理画面での直接変更

そのため、Actions 以外を PROD 反映の正規ルートにしない。緊急対応で直接操作が必要な場合も、事前承認、操作内容、影響範囲、結果を Issue または PR に残す。

## Forward-fix 方針

PROD 反映後に不具合が見つかった場合、既存データの破壊的 rollback を前提にしない。原則として、修正 commit を作り、必要な検証を通したうえで同じ `production-release.yml` から forward-fix release として反映する。
