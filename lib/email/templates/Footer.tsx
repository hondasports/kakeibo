import { Link, Text } from "react-email";
import { buildEmailUrl } from "../url";

export function EmailFooter({
  settingsActiveAccountOnly,
}: {
  settingsActiveAccountOnly?: boolean;
}) {
  return (
    <>
      <Text style={{ color: "#6b7280", fontSize: "12px" }}>
        このメールは、Suzumemoの重要な状態変更または確認が必要な処理についてお知らせしています。
        重要なお知らせは個別に停止できませんが、AIレビューの通知は設定から変更できます。 © Suzumemo
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "12px" }}>
        <Link href={buildEmailUrl("/settings#notifications")} style={{ color: "#2563eb" }}>
          通知設定を変更
        </Link>
        {settingsActiveAccountOnly ? "（アカウント有効時のみ利用できます）" : null}
      </Text>
    </>
  );
}
