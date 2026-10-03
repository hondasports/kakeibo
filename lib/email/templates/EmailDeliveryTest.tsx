import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";
import type { EmailDeliveryTestPayload } from "../model";
import { EmailFooter } from "./Footer";

export function EmailDeliveryTest({ to, groupName }: EmailDeliveryTestPayload) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>Suzumemo メール配信テスト</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px" }}>
          <Heading as="h1">Suzumemo メール配信テスト</Heading>
          <Section>
            <Text>以下のアドレスにメールが正常に配信されています。</Text>
            <Text style={{ fontFamily: "monospace", fontSize: "16px" }}>{to}</Text>
            {groupName ? <Text>グループ: {groupName}</Text> : null}
          </Section>
          <Section>
            <Text style={{ color: "#6b7280" }}>
              このメールは配信テストとして送信されています。心当たりがない場合は無視してください。
            </Text>
          </Section>
          <Section>
            <EmailFooter />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
