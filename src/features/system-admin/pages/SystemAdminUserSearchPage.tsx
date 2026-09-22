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
import type { PageResult, UserSearchItem } from "../types";

type UserQueryType = "displayName" | "email" | "userId";

export function SystemAdminUserSearchPage() {
  const searchUsers = useAction(api.systemAdminSearch.searchUsers);
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<UserQueryType>("displayName");
  const [result, setResult] = useState<PageResult<UserSearchItem> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const runSearch = async (nextCursor: string | null) => {
    const normalizedQuery = query.trim();
    setIsLoading(true);
    setError(false);
    try {
      const response = await searchUsers({
        queryType,
        query: normalizedQuery,
        paginationOpts: { numItems: 20, cursor: nextCursor },
      });
      setResult(response as PageResult<UserSearchItem>);
      setCursor(nextCursor);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SystemAdminPageFrame
      description="家計データを含まないユーザー管理情報を検索します。"
      title="ユーザー検索"
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
            <InputLabel id="system-admin-user-query-type-label">検索対象</InputLabel>
            <Select
              label="検索対象"
              labelId="system-admin-user-query-type-label"
              value={queryType}
              onChange={(event) => setQueryType(event.target.value as UserQueryType)}
            >
              <MenuItem value="displayName">表示名</MenuItem>
              <MenuItem value="email">メールアドレス</MenuItem>
              <MenuItem value="userId">userId</MenuItem>
            </Select>
          </FormControl>
          <TextField
            autoComplete="off"
            fullWidth
            helperText="未入力で検索すると新しい順に一覧表示します"
            label="ユーザー検索"
            name="user-search"
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
            {result.page.map((user) => (
              <Paper key={user.id} sx={{ p: 2 }} variant="outlined">
                <Typography component="h3" variant="h6">
                  {user.displayName}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {user.email ?? "メールアドレス未登録"}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  userId: {user.userId}
                </Typography>
                <Button
                  component={RouterLink}
                  size="small"
                  to={`/admin/users/${user.id}`}
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
          <SystemAdminEmptyState message="一致するユーザーはありません。検索条件を確認してください。" />
        )
      ) : null}
      <Alert severity="info" variant="outlined">
        表示されるのは表示名、メールアドレス、userId、所属グループ識別子などの管理情報だけです。
      </Alert>
    </SystemAdminPageFrame>
  );
}
