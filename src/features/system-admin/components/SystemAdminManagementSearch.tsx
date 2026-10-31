import {
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
import { SystemAdminEmptyState, SystemAdminErrorState } from "../pages/SystemAdminPageFrame";
import type { UserSearchItem } from "../types";
import type { UserSearchType } from "../../../../lib/domain/systemAdmin/searchQuery";

type SystemAdminManagementSearchProps = {
  searchType: UserSearchType;
  searchQuery: string;
  searching: boolean;
  hasSearched: boolean;
  searchError: boolean;
  candidates: UserSearchItem[];
  onSearchTypeChange: (type: UserSearchType) => void;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  onRetry: () => void;
  onGrant: (candidate: UserSearchItem) => void;
  isSelf: (target: UserSearchItem) => boolean;
};

export function SystemAdminManagementSearch({
  searchType,
  searchQuery,
  searching,
  hasSearched,
  searchError,
  candidates,
  onSearchTypeChange,
  onSearchQueryChange,
  onSearch,
  onRetry,
  onGrant,
  isSelf,
}: SystemAdminManagementSearchProps) {
  return (
    <>
      <Paper
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
        sx={{ p: 2 }}
        variant="outlined"
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "flex-end" } }}
        >
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel id="system-admin-search-type-label">検索対象</InputLabel>
            <Select
              label="検索対象"
              labelId="system-admin-search-type-label"
              value={searchType}
              onChange={(event) => onSearchTypeChange(event.target.value as UserSearchType)}
            >
              <MenuItem value="displayName">表示名</MenuItem>
              <MenuItem value="email">メールアドレス</MenuItem>
              <MenuItem value="userId">userId</MenuItem>
            </Select>
          </FormControl>
          <TextField
            autoComplete="off"
            fullWidth
            helperText="未入力で検索すると新しい順の候補を表示します（最大10件）"
            label="付与対象を検索"
            name="system-admin-user-search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
          <Button disabled={searching} type="submit" variant="contained">
            {searching ? <CircularProgress aria-label="検索中" size={20} /> : "候補を検索"}
          </Button>
        </Stack>
      </Paper>
      {searchError ? <SystemAdminErrorState onRetry={onRetry} /> : null}
      {candidates.length > 0 ? (
        <Stack aria-label="管理者付与候補" spacing={1}>
          {candidates.map((candidate) => (
            <Paper key={candidate.id} sx={{ p: 2 }} variant="outlined">
              <Typography component="h3" variant="h6">
                {candidate.displayName}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {candidate.email ?? "メールアドレス未登録"}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                userId: {candidate.userId}
              </Typography>
              <Button
                disabled={isSelf(candidate)}
                onClick={() => onGrant(candidate)}
                sx={{ mt: 1 }}
                variant="outlined"
              >
                {isSelf(candidate) ? "自分自身は付与できません" : "このユーザーを付与"}
              </Button>
              {isSelf(candidate) ? (
                <Typography color="text.secondary" variant="caption">
                  自分自身は操作対象にできません。
                </Typography>
              ) : null}
            </Paper>
          ))}
        </Stack>
      ) : hasSearched && !searching && !searchError ? (
        <SystemAdminEmptyState message="一致するユーザーはありません。検索条件を確認してください。" />
      ) : null}
    </>
  );
}
