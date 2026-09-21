import { PublicStatusPage } from "../components/PublicStatusPage";

export function NotFoundPage() {
  return (
    <PublicStatusPage
      description="指定されたページは移動または削除された可能性があります。ホームからもう一度お探しください。"
      headerBrand={{
        alt: "Suzumemo",
        showWordmark: true,
        src: "/suzumemo-app-icon.svg",
        variant: "plain",
        width: 64,
      }}
      label="404 Not Found"
      primaryAction={{ label: "ホームへ戻る", href: "/" }}
      secondaryActions={[
        { label: "プライバシー", href: "/privacy" },
        { label: "利用規約", href: "/terms" },
      ]}
      title="ページが見つかりません"
    />
  );
}
