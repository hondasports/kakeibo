import { Box, Button, Stack, Typography } from "@mui/material";
import { Link, useLocation } from "react-router-dom";

type HistoryNavigationProps = {
  weeklyPath: string;
  monthlyPath: string;
  searchPath: string;
};

type HistoryNavigationItem = {
  label: string;
  path: string;
  active: boolean;
};

function isWeeklyHistoryPath(pathname: string) {
  return pathname.startsWith("/weeks/") && pathname !== "/weeks/current/input";
}

function isMonthlyHistoryPath(pathname: string) {
  return pathname.startsWith("/months/");
}

function isSearchHistoryPath(pathname: string) {
  return pathname === "/search";
}

export function HistoryNavigation({ weeklyPath, monthlyPath, searchPath }: HistoryNavigationProps) {
  const { pathname } = useLocation();
  const items: HistoryNavigationItem[] = [
    { label: "週次サマリー", path: weeklyPath, active: isWeeklyHistoryPath(pathname) },
    { label: "月次サマリー", path: monthlyPath, active: isMonthlyHistoryPath(pathname) },
    { label: "履歴検索", path: searchPath, active: isSearchHistoryPath(pathname) },
  ];

  return (
    <Box
      aria-label="履歴メニュー"
      component="nav"
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: { xs: 1.25, sm: 1.5 },
      }}
    >
      <Stack spacing={1}>
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>
          履歴
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {items.map((item) => (
            <Button
              key={item.label}
              aria-current={item.active ? "page" : undefined}
              component={Link}
              nativeButton={false}
              sx={{ minHeight: 44, flex: { sm: "0 1 auto" } }}
              to={item.path}
              variant={item.active ? "contained" : "outlined"}
            >
              {item.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
