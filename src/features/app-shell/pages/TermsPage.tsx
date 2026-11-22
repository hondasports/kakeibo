import { Typography } from "@mui/material";
import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR_ADDRESS_DISCLOSURE,
  LEGAL_OPERATOR_NAME,
  TERMS_LAST_REVISED_DATE,
} from "../lib/legalDocumentMeta";

export function TermsPage() {
  return (
    <LegalDocumentLayout
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      lastRevisedDate={TERMS_LAST_REVISED_DATE}
      title="利用規約"
    >
      <Typography color="text.secondary" variant="body2">
        本利用規約（以下「本規約」）は、Suzumemo（以下「本サービス」）の利用条件を定めるものです。
        ユーザーは本規約およびプライバシーポリシーに同意のうえ、本サービスを利用してください。
        Google アカウントでログインした時点で、本規約に同意したものとみなします。
      </Typography>

      <LegalSection title="運営者">
        <Typography variant="body2">運営者: {LEGAL_OPERATOR_NAME}</Typography>
        <Typography variant="body2">連絡先: {LEGAL_CONTACT_EMAIL}</Typography>
        <Typography variant="body2">{LEGAL_OPERATOR_ADDRESS_DISCLOSURE}</Typography>
      </LegalSection>

      <LegalSection title="適用範囲">
        <Typography variant="body2">
          本規約は、本サービスの利用に関わる一切の関係に適用されます。
        </Typography>
      </LegalSection>

      <LegalSection title="サービス内容">
        <Typography variant="body2">
          本サービスは、週次の家計簿入力、レシート・支出の記録、カテゴリ別集計、家族・グループでのデータ共有、
          レシート画像の AI による読み取り補助等を提供する Web アプリです。
        </Typography>
      </LegalSection>

      <LegalSection title="アカウント登録と管理">
        <Typography variant="body2">
          ユーザーは Google アカウント等を用いて本サービスに登録できます。
          アカウント情報の管理責任はユーザー自身にあり、第三者による不正利用を防ぐため、
          適切に管理してください。
        </Typography>
      </LegalSection>

      <LegalSection title="グループ共有">
        <Typography variant="body2">
          ユーザーは家族・グループを作成または参加でき、同一グループのメンバー間で家計データを共有します。
          招待はメールアドレスを用いて行い、受諾時には招待メールとログイン中アカウントのメールアドレスが一致する必要があります。
          グループのオーナーは、メンバーの招待・削除等の管理操作を行えます。
          グループが削除された場合、当該グループの家計データは削除されます。
        </Typography>
      </LegalSection>

      <LegalSection title="禁止事項">
        <Typography variant="body2">ユーザーは、以下の行為をしてはなりません。</Typography>
        <Typography component="ul" sx={{ m: 0, pl: 2.5 }} variant="body2">
          <li>法令または公序良俗に反する行為</li>
          <li>不正アクセス、権限のない操作、脆弱性の探索</li>
          <li>過度なアクセスや自動化による負荷の発生</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>他人の個人情報を、本人の同意なくアップロードまたは入力する行為</li>
          <li>不正・不適切な利用、その他運営者が不適切と判断する行為</li>
        </Typography>
      </LegalSection>

      <LegalSection title="ユーザー入力情報の扱い">
        <Typography variant="body2">
          メモ、金額、カテゴリ、日付等の入力情報は、ユーザー自身が管理するものとします。
          入力内容の正確性、保存、削除についてはユーザーの責任において行ってください。
        </Typography>
      </LegalSection>

      <LegalSection title="ユーザー投稿データの権利">
        <Typography variant="body2">
          ユーザーが入力したデータの著作権その他の権利は、ユーザーに帰属します。
          ユーザーは、本サービスの提供・同期・バックアップ等に必要な範囲で、運営者が当該データを利用することを許諾するものとします。
        </Typography>
      </LegalSection>

      <LegalSection title="AI解析・自動分類機能">
        <Typography variant="body2">
          本サービスには、レシート画像等を外部 API に送信して読み取る AI
          解析・自動分類機能が含まれます。利用には事前の同意が必要です。
          解析結果は参考情報であり、その正確性を保証しません。最終的な記録内容はユーザー自身が確認し、登録してください。
        </Typography>
      </LegalSection>

      <LegalSection title="利用料金">
        <Typography variant="body2">
          本サービスは、現時点では無料で提供します。将来、有料プラン等を導入する場合は、事前に本サービス上で告知します。
        </Typography>
      </LegalSection>

      <LegalSection title="サービス変更・停止・終了">
        <Typography variant="body2">
          運営者は、本サービスの内容変更、一時停止、または終了を行う場合があります。
          重大な変更や終了については、合理的な方法で事前に告知するよう努めます。
        </Typography>
      </LegalSection>

      <LegalSection title="免責事項">
        <Typography variant="body2">
          運営者は、本サービス上の家計管理・支出記録の正確性を保証しません。
          入力内容、分類結果、表示内容の正確性、完全性、有用性についても保証しません。
          本サービスの利用により生じた損害について、運営者に故意または重過失がない限り
          責任を負いません。
        </Typography>
      </LegalSection>

      <LegalSection title="知的財産権">
        <Typography variant="body2">
          本サービスに関する著作権、商標権その他の知的財産権は、運営者または正当な権利者に帰属します。
        </Typography>
      </LegalSection>

      <LegalSection title="退会・アカウント削除">
        <Typography variant="body2">
          ユーザーは、{LEGAL_CONTACT_EMAIL}{" "}
          までご連絡いただくことで、退会およびアカウント削除を求めることができます。
        </Typography>
      </LegalSection>

      <LegalSection title="未成年者">
        <Typography variant="body2">
          未成年者が本サービスを利用する場合は、保護者の同意を得たうえで利用してください。
        </Typography>
      </LegalSection>

      <LegalSection title="反社会的勢力の排除">
        <Typography variant="body2">
          ユーザーは、自己が反社会的勢力に該当しないこと、および反社会的勢力と関係を有しないことを表明し、保証するものとします。
        </Typography>
      </LegalSection>

      <LegalSection title="お問い合わせ">
        <Typography variant="body2">
          本規約に関するお問い合わせは、{LEGAL_CONTACT_EMAIL} までご連絡ください。
        </Typography>
      </LegalSection>

      <LegalSection title="規約変更">
        <Typography variant="body2">
          運営者は、必要に応じて本規約を変更できます。変更後の規約は、本サービス上での掲示をもって効力を生じます。
        </Typography>
      </LegalSection>

      <LegalSection title="準拠法・管轄">
        <Typography variant="body2">
          本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、
          運営者の住所地を管轄する裁判所を第一審の専属的合意管轄とします。
        </Typography>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
