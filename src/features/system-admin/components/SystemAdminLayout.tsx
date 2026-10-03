import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import DashboardIcon from "@mui/icons-material/Dashboard";
import GroupIcon from "@mui/icons-material/Group";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import HistoryIcon from "@mui/icons-material/History";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useTheme } from "@mui/material/styles";

type AppEnvironment = "development" | "preview" | "production";

const DRAWER_WIDTH = 248;
const navItems = [
  { label: "管理トップ", path: "/admin", icon: <DashboardIcon /> },
  { label: "ユーザー", path: "/admin/users", icon: <ManageAccountsIcon /> },
  { label: "グループ", path: "/admin/groups", icon: <GroupIcon /> },
  { label: "監査ログ", path: "/admin/audit-logs", icon: <HistoryIcon /> },
  { label: "管理者", path: "/admin/system-admins", icon: <AdminPanelSettingsIcon /> },
  { label: "削除ジョブ", path: "/admin/group-deletion", icon: <DeleteSweepIcon /> },
  { label: "通知設定", path: "/admin/notifications", icon: <NotificationsIcon /> },
];

const environmentLabel: Record<AppEnvironment, string> = {
  development: "Development",
  preview: "Preview",
  production: "Production",
};

export function SystemAdminLayout({ environment }: { environment: AppEnvironment }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const drawer = (
    <Box component="nav" aria-label="システム管理者メニュー" sx={{ width: DRAWER_WIDTH }}>
      <Toolbar>
        <AdminPanelSettingsIcon sx={{ mr: 1 }} />
        <Typography sx={{ fontWeight: 700 }}>管理コンソール</Typography>
      </Toolbar>
      <List>
        {navItems.map((item) => (
          <ListItemButton
            component={Link}
            key={item.path}
            selected={
              item.path === "/admin"
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)
            }
            to={item.path}
            onClick={() => setMobileOpen(false)}
          >
            {item.icon}
            <ListItemText primary={item.label} sx={{ ml: 1 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ bgcolor: "background.default", display: "flex", minHeight: "100vh" }}>
      {isDesktop ? (
        <Drawer open variant="permanent">
          {drawer}
        </Drawer>
      ) : null}
      {!isDesktop ? (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
          {drawer}
        </Drawer>
      ) : null}
      <Box component="main" sx={{ flex: 1, minWidth: 0, ml: isDesktop ? `${DRAWER_WIDTH}px` : 0 }}>
        <AppBar
          color="inherit"
          elevation={0}
          position="static"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Toolbar sx={{ gap: 1, flexWrap: "wrap" }}>
            {!isDesktop ? (
              <IconButton
                aria-label="管理メニューを開く"
                edge="start"
                onClick={() => setMobileOpen(true)}
              >
                <MenuIcon />
              </IconButton>
            ) : null}
            <Typography component="h1" sx={{ flexGrow: 1, fontWeight: 700 }}>
              システム管理者として操作
            </Typography>
            <Chip
              color={environment === "production" ? "error" : "info"}
              label={`環境: ${environmentLabel[environment]}`}
              size="small"
            />
          </Toolbar>
        </AppBar>
        <Box sx={{ px: { xs: 2, md: 4 }, py: 2 }}>
          <AlertBanner />
          <Box sx={{ mt: 3 }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function AlertBanner() {
  return (
    <Alert aria-label="家計データ非表示の注意" severity="info" variant="outlined">
      家計データは表示されません。ユーザー・グループの管理情報だけを扱います。
    </Alert>
  );
}
