import { Typography } from "@mui/material";
import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR_ADDRESS_DISCLOSURE,
  LEGAL_OPERATOR_NAME,
  PRIVACY_LAST_REVISED_DATE,
} from "../lib/legalDocumentMeta";

export function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastRevisedDate={PRIVACY_LAST_REVISED_DATE}
      title="プライバシーポリシー"
    >
      <Typography color="text.secondary" variant="body2">
        Suzumemo（以下「本サービス」）は、ユーザーの個人情報を適切に取り扱うため、本プライバシーポリシーを定めます。
      </Typography>

      <LegalSection title="運営者">
        <Typography variant="body2">運営者: {LEGAL_OPERATOR_NAME}</Typography>
        <Typography variant="body2">連絡先: {LEGAL_CONTACT_EMAIL}</Typography>
        <Typography variant="body2">{LEGAL_OPERATOR_ADDRESS_DISCLOSURE}</Typography>
      </LegalSection>

      <LegalSection title="取得する情報">
        <Typography variant="body2">
          本サービスでは、以下の情報を取得する場合があります。
        </Typography>
        <Typography component="ul" sx={{ m: 0, pl: 2.5 }} variant="body2">
          <li>Googleログインにより取得されるメールアドレス、氏名、プロフィール画像等の認証情報</li>
          <li>Clerk 経由で管理されるユーザー ID、表示名等のアカウント情報</li>
          <li>
            ユーザーが入力した支出・収入、カテゴリ、店名、メモ、金額、日付、週次設定、月収入（任意入力時）等の家計データ
          </li>
          <li>グループ名、メンバー関係、招待メールアドレス等のグループ関連情報</li>
          <li>
            レシート画像・コンビニ払込票画像（解析時のみ）、ファイル名、AI
            抽出下書き、信頼度・警告情報等の AI 解析関連情報
          </li>
          <li>グループ管理操作の監査ログ</li>
          <li>IPアドレス、ブラウザ情報、アクセス日時等の技術情報</li>
        </Typography>
      </LegalSection>

      <LegalSection title="利用目的">
        <Typography component="ul" sx={{ m: 0, pl: 2.5 }} variant="body2">
          <li>認証、アカウント管理</li>
          <li>サービス提供、入力情報の保存・表示・編集・削除</li>
          <li>家族・グループ内でのデータ共有・同期</li>
          <li>グループ招待メールの送信、メンバー管理</li>
          <li>レシート画像の AI 解析（ユーザーが同意した場合のみ）</li>
          <li>不具合対応、セキュリティ確保、サービス改善</li>
        </Typography>
      </LegalSection>

      <LegalSection title="Googleログインについて">
        <Typography variant="body2">
          Googleログインは認証目的でのみ利用します。Gmail / Google Drive / Google Calendar
          等の内容は取得しません。
        </Typography>
      </LegalSection>

      <LegalSection title="レシート画像の外部API送信">
        <Typography variant="body2">
          レシート画像の読み取り補助機能を利用する場合、初回に外部 API
          への送信について同意を求めます。同意がない場合は画像を送信せず、手入力のみ利用できます。
        </Typography>
        <Typography component="ul" sx={{ m: 0, pl: 2.5, mt: 1 }} variant="body2">
          <li>同意の有無はユーザー単位で記録し、次回以降の判定に利用します</li>
          <li>送信された画像は解析目的の一時利用にとどめ、長期保存しません</li>
          <li>解析結果は下書きとして表示され、自動では家計簿に登録されません</li>
        </Typography>
      </LegalSection>

      <LegalSection title="グループ共有">
        <Typography variant="body2">
          ユーザーが所属する家族・グループ内では、支出・収入等の家計データを他のメンバーと共有します。
          グループのオーナーは、メール招待によるメンバー追加やメンバー削除を行えます。
          招待の受諾は、招待メールとログイン中アカウントのメールアドレスが一致する場合に限ります。
        </Typography>
      </LegalSection>

      <LegalSection title="外部サービスへの委託">
        <Typography variant="body2">
          本サービスでは、サービス提供に必要な範囲で、以下の外部サービスに処理を委託します。
        </Typography>
        <Typography component="ul" sx={{ m: 0, pl: 2.5 }} variant="body2">
          <li>Clerk（認証・アカウント管理）</li>
          <li>Google（OAuth 認証）</li>
          <li>Vercel（ホスティング）</li>
          <li>Convex（データベース・バックエンド）</li>
          <li>OpenAI（レシート画像の AI 解析。ユーザー同意がある場合のみ）</li>
        </Typography>
        <Typography sx={{ mt: 1 }} variant="body2">
          外部サービスの追加・変更がある場合は、本ポリシーを改定して告知します。
        </Typography>
      </LegalSection>

      <LegalSection title="第三者提供">
        <Typography variant="body2">
          法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。
          前項の委託は第三者提供には該当しません。
        </Typography>
      </LegalSection>

      <LegalSection title="国外への情報移転">
        <Typography variant="body2">
          委託先（Clerk、Convex、Vercel、OpenAI
          等）は、米国等の国外にあるサーバーで情報を処理する場合があります。
          国外移転にあたっては、委託先の安全管理措置を確認したうえで必要な措置を講じます。
        </Typography>
      </LegalSection>

      <LegalSection title="保存期間">
        <Typography variant="body2">
          アカウントおよび家計データは、ユーザーが削除を求めるまで、または本サービスの提供に必要な期間保存します。
          グループが削除された場合、当該グループに紐づく家計データは削除します。
          レシート画像は解析のため一時的に送信するのみで、長期保存しません。
        </Typography>
      </LegalSection>

      <LegalSection title="安全管理措置">
        <Typography variant="body2">
          本サービスでは、認証の必須化、グループ単位のアクセス制御、通信の暗号化（HTTPS）等により、
          個人情報の漏えい・滅失・毀損の防止に努めます。
        </Typography>
      </LegalSection>

      <LegalSection title="Cookie等の利用">
        <Typography variant="body2">
          本サービスでは、認証セッションの維持（Clerk）等のため、Cookie
          および類似技術を利用します。ブラウザ設定で Cookie
          を無効にした場合、ログイン等の一部機能が利用できなくなることがあります。
        </Typography>
      </LegalSection>

      <LegalSection title="開示・訂正・利用停止・削除">
        <Typography variant="body2">
          ユーザーは、本サービス上の設定画面または {LEGAL_CONTACT_EMAIL}{" "}
          までご連絡いただくことで、自己の情報の開示・訂正・利用停止・削除を求めることができます。
          ご請求には、合理的な期間内に対応します。
        </Typography>
      </LegalSection>

      <LegalSection title="お問い合わせ先">
        <Typography variant="body2">
          本ポリシーに関するお問い合わせは、以下までご連絡ください。
        </Typography>
        <Typography variant="body2">{LEGAL_CONTACT_EMAIL}</Typography>
      </LegalSection>

      <LegalSection title="改定">
        <Typography variant="body2">
          本ポリシーは、必要に応じて改定することがあります。重要な変更がある場合は、本サービス上で告知します。
        </Typography>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
