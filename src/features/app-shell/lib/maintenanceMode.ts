/** メンテナンス中でも閲覧可能な法務・案内ページ */
export const MAINTENANCE_EXEMPT_PATHS = ["/privacy", "/terms", "/maintenance"] as const;

/** 計画メンテナンス時に画面へ出す情報。未設定の項目は表示しない */
export type MaintenanceInfo = {
  period?: string;
  reason?: string;
  eta?: string;
};

export function getMaintenanceInfo(): MaintenanceInfo {
  const period = import.meta.env.VITE_APP_MAINTENANCE_PERIOD?.trim();
  const reason = import.meta.env.VITE_APP_MAINTENANCE_REASON?.trim();
  const eta = import.meta.env.VITE_APP_MAINTENANCE_ETA?.trim();
  return {
    period: period || undefined,
    reason: reason || undefined,
    eta: eta || undefined,
  };
}

export function isMaintenanceMode(): boolean {
  return import.meta.env.VITE_APP_MAINTENANCE_MODE === "true";
}

export function isMaintenanceExemptPath(pathname: string): boolean {
  return (MAINTENANCE_EXEMPT_PATHS as readonly string[]).includes(pathname);
}

export function shouldShowMaintenancePage(pathname: string): boolean {
  return isMaintenanceMode() && !isMaintenanceExemptPath(pathname);
}
