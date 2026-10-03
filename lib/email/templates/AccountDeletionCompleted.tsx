import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";
import type { AccountDeletionCompletedPayload } from "../model";
import { EmailFooter } from "./Footer";

export function AccountDeletionCompleted({
  leftGroupCount,
  deletedGroupCount,
}: AccountDeletionCompletedPayload) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>Suzumemoの退会が完了しました</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px" }}>
          <Section>
            <Text>Suzumemoの退会手続きが完了しました。</Text>
            <Text>あなたのSuzumemoアカウントは削除されました。</Text>
            {leftGroupCount > 0 ? (
              <Text>
                所属していた共有グループからは退会しています。ほかのメンバーが利用している共有グループの家計データは削除されていません。
              </Text>
            ) : null}
            {deletedGroupCount > 0 ? (
              <Text>あなたのみが利用していたグループと、その家計データは削除されています。</Text>
            ) : null}
            <Text>Suzumemoをご利用いただき、ありがとうございました。</Text>
            <Text>
              このメールは、Suzumemoの退会手続き完了をお知らせするために送信しています。{"\n\n"}©
              Suzumemo
            </Text>
          </Section>
          <Section>
            <EmailFooter settingsActiveAccountOnly />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
