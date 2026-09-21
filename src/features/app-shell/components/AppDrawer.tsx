import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useTheme } from "@mui/material/styles";
import {
  DRAWER_WIDTH,
  DRAWER_WIDTH_MINI,
  type NavItem,
  isNavItemSelected,
} from "../lib/navigationConfig";

type AppDrawerProps = {
  navItems: NavItem[];
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
};

export function AppDrawer({ navItems, onToggleSidebar, sidebarOpen }: AppDrawerProps) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const drawerWidth = sidebarOpen ? DRAWER_WIDTH : DRAWER_WIDTH_MINI;

  return (
    <Drawer
      aria-label="サイドメニュー"
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          overflowX: "hidden",
          transition: theme.transitions.create("width", {
            easing: theme.transitions.easing.sharp,
            duration: sidebarOpen
              ? theme.transitions.duration.enteringScreen
              : theme.transitions.duration.leavingScreen,
          }),
        },
      }}
    >
      <Toolbar
        sx={{
          justifyContent: sidebarOpen ? "space-between" : "center",
          px: sidebarOpen ? 2 : 0,
          gap: 1,
        }}
      >
        {sidebarOpen && (
          <Box
            component={Link}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              minWidth: 0,
              gap: 1,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Box
              alt=""
              component="img"
              src="/suzumemo-app-icon.svg"
              sx={{ height: 34, width: 34, flex: "0 0 auto", borderRadius: 2 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                variant="h6"
                sx={{ display: "block", fontWeight: 800, lineHeight: 1.05 }}
              >
                Suzumemo
              </Typography>
              <Typography
                component="span"
                color="text.secondary"
                sx={{ display: "block", fontSize: "0.7rem", fontWeight: 700, lineHeight: 1.1 }}
              >
                スズメモ
              </Typography>
            </Box>
          </Box>
        )}
        <IconButton
          aria-label={sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
          onClick={onToggleSidebar}
          size="small"
        >
          {sidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => (
          <Tooltip key={item.path} title={sidebarOpen ? "" : item.label} placement="right" arrow>
            <ListItemButton
              selected={isNavItemSelected(location.pathname, item.path)}
              onClick={() => navigate(item.path)}
              component={Link}
              to={item.path}
              sx={{ justifyContent: sidebarOpen ? "flex-start" : "center", px: 1.5 }}
            >
              <ListItemIcon
                sx={{ minWidth: 0, mr: sidebarOpen ? 1.5 : 0, justifyContent: "center" }}
              >
                {item.icon}
              </ListItemIcon>
              {sidebarOpen && <ListItemText primary={item.label} />}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>
    </Drawer>
  );
}
