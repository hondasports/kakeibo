import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useAction } from "convex/react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  SystemAdminEmptyState,
  SystemAdminErrorState,
  SystemAdminPageFrame,
} from "./SystemAdminPageFrame";
import type { GroupSearchItem, PageResult } from "../types";

type GroupQueryType = "name" | "groupId";

export function SystemAdminGroupSearchPage() {
  const searchGroups = useAction(api.systemAdminSearch.searchGroups);
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<GroupQueryType>("name");
  const [result, setResult] = useState<PageResult<GroupSearchItem> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const runSearch = async (nextCursor: string | null) => {
    const normalizedQuery = query.trim();
    setIsLoading(true);
    setError(false);
    try {
      const response = await searchGroups({
        queryType,
        query: normalizedQuery,
        paginationOpts: { numItems: 20, cursor: nextCursor },
      });
      setResult(response as PageResult<GroupSearchItem>);
      setCursor(nextCursor);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SystemAdminPageFrame
      description="家計データを含まないグループ管理情報を検索します。"
      title="グループ検索"
    >
      <Paper
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(null);
        }}
        sx={{ p: 2 }}
        variant="outlined"
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "flex-end" } }}
        >
          <FormControl sx={{ minWidth: 160 }}>
            <InputLabel id="system-admin-group-query-type-label">検索対象</InputLabel>
            <Select
              label="検索対象"
              labelId="system-admin-group-query-type-label"
              value={queryType}
              onChange={(event) => setQueryType(event.target.value as GroupQueryType)}
            >
              <MenuItem value="name">グループ名</MenuItem>
              <MenuItem value="groupId">groupId</MenuItem>
            </Select>
          </FormControl>
          <TextField
            autoComplete="off"
            fullWidth
            helperText="未入力で検索すると新しい順に一覧表示します"
            label="グループ検索"
            name="group-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button disabled={isLoading} type="submit" variant="contained">
            {isLoading ? <CircularProgress aria-label="検索中" size={20} /> : "検索"}
          </Button>
        </Stack>
      </Paper>
      {error ? <SystemAdminErrorState onRetry={() => void runSearch(cursor)} /> : null}
      {result ? (
        result.page.length > 0 ? (
          <Stack aria-live="polite" spacing={1}>
            {result.page.map((group) => (
              <Paper key={group.id} sx={{ p: 2 }} variant="outlined">
                <Typography component="h3" variant="h6">
                  {group.name}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  groupId: {group.id}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  状態: {group.status}
                </Typography>
                <Button
                  component={RouterLink}
                  size="small"
                  to={`/admin/groups/${group.id}`}
                  sx={{ mt: 1 }}
                >
                  詳細を見る
                </Button>
              </Paper>
            ))}
            {!result.isDone ? (
              <Button disabled={isLoading} onClick={() => void runSearch(result.continueCursor)}>
                次のページ
              </Button>
            ) : null}
          </Stack>
        ) : (
          <SystemAdminEmptyState message="一致するグループはありません。検索条件を確認してください。" />
        )
      ) : null}
      <Alert severity="info" variant="outlined">
        表示されるのはグループ名、groupId、状態などの管理情報だけです。
      </Alert>
    </SystemAdminPageFrame>
  );
}
