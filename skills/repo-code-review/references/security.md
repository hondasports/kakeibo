# セキュリティ確認点

認証・認可ルールの正本は `docs/auth-guard.md`。ここでは差分レビューで見落としやすい点だけを挙げる。

## Convex関数

- query / mutation / action で `ctx.auth.getUserIdentity()` を確認し、未認証を拒否しているか
- userはサーバー側で `identity.tokenIdentifier` から解決しているか。クライアント引数のuserId・groupIdをそのまま信用していないか
- 家計データへのアクセスで `requireGroupMembership` 等による所属確認があるか（`convex/groups/membership.ts`）
- 内部処理を `query` / `mutation` / `action` で公開していないか。サーバー内からだけ呼ぶものは `internalQuery` / `internalMutation` / `internalAction` にする
- `args` にvalidatorを定義しているか。`v.any()` で境界を緩めていないか

## system admin

- 新しいadmin操作を追加・変更したら `convex/systemAdminSecurityMatrix.test.ts` に行を追加しているか
- 権限モデルは `docs/system-admin-authorization.md` と一致しているか
- 監査ログ（`systemAdminAuditLogs`）に、影響を受けた全user（owner付替えの付替え元など、対象以外も含む）と変更前後の状態が記録されているか。表示名はsnapshotとして対象userのものを残しているか

## HTTP endpoint

- LINE webhook（`convex/lineWebhook/webhook.ts`）は `x-line-signature` を検証してから処理しているか
- Resend webhook（`convex/email/webhooks/resendWebhook.ts`）は署名検証を通してから処理しているか
- `convex/e2eHttp/**`・`convex/e2ePurge.ts` のendpointは `requireE2eSecret` / `isE2eAppEnvironment`（`convex/e2eHttp/e2eAuth.ts`）で保護され、`APP_ENV` 未設定や本番でfail-closedになっているか

## 外部API・secret

- OpenAI・Resend・LINEのsecretがログ・エラー文言・クライアントへの返り値に出ていないか
- レシート抽出のLLM出力はデータとして扱い、`lib/convex/receiptImageExtraction/parseExtraction.ts`・`validators.ts` の検証を通してから保存しているか

## 入力・表示

- レシート画像は `lib/domain/common/imageDataUrl.ts` の `validateImageDataUrl`（MIME許可リスト・`MAX_IMAGE_DATA_URL_LENGTH`）を通しているか。許可リストや上限を緩めていないか
- メールテンプレート（`lib/email/`）でユーザー入力をエスケープしているか
- `dangerouslySetInnerHTML` を新たに使っていないか（現状は未使用）

## 配信・フロント

- `vercel.json` のCSP・`connect-src` 等を広げていないか。ワイルドカードを追加する場合は理由が必要
- フロントのルートガード（`src/router.tsx`）はUX目的。認可はサーバー側で行っているか
