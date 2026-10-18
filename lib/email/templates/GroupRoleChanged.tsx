import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";
import { formatGroupRoleLabel } from "../../domain/groups/role";
import { type GroupRoleChangedPayload } from "../model";
import { buildEmailUrl } from "../url";
import { EmailFooter } from "./Footer";

export function GroupRoleChanged({ groupName, previousRole, newRole }: GroupRoleChangedPayload) {
  const previousRoleLabel = formatGroupRoleLabel(previousRole);
  const newRoleLabel = formatGroupRoleLabel(newRole);

  const bodyText =
    newRole === "owner"
      ? `「${groupName}」での権限が、${previousRoleLabel}から${newRoleLabel}へ変更されました。 オーナーとして、メンバーや招待などのグループ管理を行えるようになりました。`
      : `「${groupName}」での権限が、${previousRoleLabel}から${newRoleLabel}へ変更されました。 グループ管理は行えなくなりましたが、グループへの所属と家計データの利用は継続できます。`;

  return (
    <Html lang="ja">
      <Head />
      <Preview>「{groupName}」での権限が変更されました</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px" }}>
          <Heading as="h1">「{groupName}」での権限が変更されました</Heading>
          <Section>
            <Text>{bodyText}</Text>
          </Section>
          <Section>
            <Button
              href={buildEmailUrl("/settings")}
              style={{ padding: "12px 24px", backgroundColor: "#111827", color: "#ffffff" }}
            >
              グループ設定を確認する
            </Button>
          </Section>
          <Section>
            <EmailFooter />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
