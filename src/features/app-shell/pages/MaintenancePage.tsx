import { PublicStatusPage } from "../components/PublicStatusPage";

export function MaintenancePage() {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <PublicStatusPage
      description="Suzumemo を安心して使えるように、ただいま整えています。しばらく時間をおいてから、もう一度お試しください。"
      headerBrand={{
        alt: "Suzumemo スズメモ",
        src: "/suzumemo-logo-lockup.svg",
        variant: "lockup",
        width: "min(180px, 60vw)",
      }}
      label="Maintenance"
      primaryAction={{ label: "再読み込み", onClick: handleReload }}
      secondaryActions={[
        { label: "プライバシー", href: "/privacy" },
        { label: "利用規約", href: "/terms" },
      ]}
      title="ただいまメンテナンス中です"
    />
  );
}
