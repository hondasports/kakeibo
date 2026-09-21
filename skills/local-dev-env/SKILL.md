---
name: local-dev-env
description: ローカル開発・E2E用の環境準備（.env.local正本、env同期、devサーバ起動）が必要なときに使う。
license: Apache-2.0
---

# ローカル環境を準備する

## 適用

- 新しいtask worktreeで最初の `pnpm run dev` / E2E実行前
- `.env.local` が無い・古い場合
- local Convex deploymentの作成・反映が必要な場合

## 手順

1. 新しいworktreeでは最初に `mise install`（Node.jsとpnpmは `mise.toml` / `package.json` が選択元）
2. `.env.local` の正本は `preview` worktree。task worktreeへのコピーは `pnpm run e2e:env-sync -- --copy-only`（`.env.local` のコピーのみ。コピー元がcloud devを向いていてもdeploymentの環境変数を書き換えない）。preview側に無ければclone元からコピーし、どちらにも無ければ復旧まで進めない
3. `pnpm run dev` はlocal Convex watcherとViteを同時起動する。local deploymentが無ければ作成される。起動直後に `CLERK_JWT_ISSUER_DOMAIN` 不足でFunction準備が待機してもwatcherは止めず、次の同期を実行する
4. E2E実行前に別ターミナルで `pnpm run e2e:env-sync`。Clerk publishable keyからissuerを復元し、選択中のlocal deploymentへ `CLERK_JWT_ISSUER_DOMAIN`、`APP_ENV=development`、mock抽出、E2Eユーザー/cleanup設定を反映する。cloud dev deploymentへ同期する場合だけ `pnpm run e2e:env-sync:cloud` を明示する
5. `pnpm exec playwright test e2e/<spec>.spec.ts --project=chromium`
6. E2E終了後はwatcherを `Ctrl+C` で停止する

## 注意

- secretやissuerの実値をchat・Issue・PR・log・commitへ出さない
- Windowsの既知パターン: Convex CLIが設定成功後の終了処理だけassertするケースでは、成功メッセージだけでPASSにせず最後のcleanup認証HTTPが200になるまで確認する
- 詳細は `docs/development-process.md` §3・§7、`docs/environment-variables.md`
