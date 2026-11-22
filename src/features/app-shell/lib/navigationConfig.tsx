import SettingsIcon from "@mui/icons-material/Settings";
import HomeIcon from "@mui/icons-material/Home";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import { getCurrentWeekStartDate } from "../../week";

export const DRAWER_WIDTH = 220;
export const DRAWER_WIDTH_MINI = 56;

export type NavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
};

export function createNavItems(weeklyStartDay?: number): NavItem[] {
  const currentWeekStartDate = getCurrentWeekStartDate(weeklyStartDay);

  return [
    { label: "ホーム", path: "/", icon: <HomeIcon /> },
    { label: "入力", path: "/weeks/current/input", icon: <EditIcon /> },
    { label: "履歴", path: `/weeks/${currentWeekStartDate}`, icon: <HistoryIcon /> },
    { label: "使い方", path: "/guide", icon: <HelpOutlinedIcon /> },
    { label: "設定", path: "/settings", icon: <SettingsIcon /> },
  ];
}

export function getBottomNavValue(pathname: string, navItems: NavItem[]) {
  const index = navItems.findIndex((item) => isNavItemSelected(pathname, item.path));
  return index >= 0 ? index : false;
}

export function isNavItemSelected(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  if (path === "/weeks/current/input") return pathname === "/weeks/current/input";
  if (path.startsWith("/weeks/")) {
    return (
      (pathname.startsWith("/weeks/") && pathname !== "/weeks/current/input") ||
      pathname.startsWith("/months/") ||
      pathname.startsWith("/years/") ||
      pathname === "/search"
    );
  }
  if (path === "/settings") {
    return (
      pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/categories"
    );
  }
  return pathname === path;
}
