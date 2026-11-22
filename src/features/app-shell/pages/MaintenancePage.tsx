import { Stack, Typography } from "@mui/material";
import { PublicStatusPage } from "../components/PublicStatusPage";
import { getMaintenanceInfo } from "../lib/maintenanceMode";

export function MaintenancePage() {
  const handleReload = () => {
    window.location.reload();
  };

  const info = getMaintenanceInfo();
  const infoLines = [
    info.period ? `期間: ${info.period}` : null,
    info.reason ? `理由: ${info.reason}` : null,
    info.eta ? `復旧見込み: ${info.eta}` : null,
  ].filter((line): line is string => line !== null);

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
        { label: "プライバシーポリシー", href: "/privacy" },
        { label: "利用規約", href: "/terms" },
      ]}
      title="ただいまメンテナンス中です"
    >
      {infoLines.length > 0 ? (
        <Stack spacing={0.5} sx={{ textAlign: "center" }}>
          {infoLines.map((line) => (
            <Typography color="text.secondary" key={line} variant="body2">
              {line}
            </Typography>
          ))}
        </Stack>
      ) : null}
    </PublicStatusPage>
  );
}
