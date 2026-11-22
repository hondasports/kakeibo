import { api } from "../../../../convex/_generated/api";
import { useRef, useState } from "react";
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
import { displayLabel, groupStatusLabels } from "../lib/displayLabels";
import type { GroupSearchType } from "../../../../lib/domain/systemAdmin/searchQuery";

export function SystemAdminGroupSearchPage() {
  const searchGroups = useAction(api.systemAdminSearch.searchGroups);
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<GroupSearchType>("name");
  const [result, setResult] = useState<PageResult<GroupSearchItem> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastRequest = useRef<{
    cursor: string | null;
    queryType: GroupSearchType;
    query: string;
  } | null>(null);
  // 表示中の結果を作った検索条件。失敗した検索では更新しない（再試行とページ送りを分けるため）。
  const appliedParams = useRef<{ queryType: GroupSearchType; query: string } | null>(null);

  const runSearch = async (
    nextCursor: string | null,
    nav?: { push?: string | null; pop?: boolean },
    params?: { queryType: GroupSearchType; query: string },
  ) => {
    // ページ送り・リトライは確定した検索条件を使う（入力中のドラフトは混ぜない）。
    const effectiveParams =
      params ??
      (appliedParams.current ? { ...appliedParams.current } : { queryType, query: query.trim() });
    lastRequest.current = { cursor: nextCursor, ...effectiveParams };
    setIsLoading(true);
    setError(false);
    try {
      const response = await searchGroups({
        queryType: effectiveParams.queryType,
        query: effectiveParams.query,
        paginationOpts: { numItems: 20, cursor: nextCursor },
      });
      setResult(response as PageResult<GroupSearchItem>);
      setCursor(nextCursor);
      appliedParams.current = effectiveParams;
      if (nav?.pop) setCursorHistory((history) => history.slice(0, -1));
      else if (nav && "push" in nav) setCursorHistory((history) => [...history, nav.push ?? null]);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewSearch = () => {
    setCursorHistory([]);
    void runSearch(null, undefined, { queryType, query: query.trim() });
  };
  const goToPrevPage = () => {
    void runSearch(cursorHistory[cursorHistory.length - 1] ?? null, { pop: true });
  };
  const retryFailedRequest = () => {
    void runSearch(
      lastRequest.current?.cursor ?? cursor,
      undefined,
      lastRequest.current
        ? { queryType: lastRequest.current.queryType, query: lastRequest.current.query }
        : undefined,
    );
  };
  const resultStart = cursorHistory.length * 20 + 1;
  const resultEnd = result ? resultStart + result.page.length - 1 : 0;

  return (
    <SystemAdminPageFrame
      description="家計データを含まないグループ管理情報を検索します。"
      title="グループ検索"
    >
      <Paper
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          startNewSearch();
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
              onChange={(event) => setQueryType(event.target.value as GroupSearchType)}
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
      {error ? <SystemAdminErrorState onRetry={retryFailedRequest} /> : null}
      {result ? (
        result.page.length > 0 ? (
          <Stack aria-live="polite" spacing={1}>
            <Typography color="text.secondary" variant="body2">
              {resultStart}〜{resultEnd}件目を表示
              {result.isDone ? "" : "（続きがあります）"}
            </Typography>
            {isLoading ? (
              <Typography color="text.secondary" variant="body2">
                読み込んでいます…
              </Typography>
            ) : null}
            {result.page.map((group) => (
              <Paper key={group.id} sx={{ p: 2 }} variant="outlined">
                <Typography component="h3" variant="h6">
                  {group.name}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  groupId: {group.id}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  状態: {displayLabel(groupStatusLabels, group.status)}
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
            <Stack direction="row" spacing={1}>
              {cursorHistory.length > 0 ? (
                <Button disabled={isLoading} onClick={goToPrevPage} variant="outlined">
                  前のページ
                </Button>
              ) : null}
              {!result.isDone ? (
                <Button
                  disabled={isLoading}
                  onClick={() => void runSearch(result.continueCursor, { push: cursor })}
                  variant="outlined"
                >
                  次のページ
                </Button>
              ) : null}
            </Stack>
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
