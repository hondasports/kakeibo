import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MAX_SAVED_SEARCH_NAME_LENGTH } from "../../../../lib/domain/savedExpenseSearches/savedExpenseSearch";
import { getConvexErrorMessage } from "../../auth";
import { hasSearchCondition, summarizeSearchQuery } from "../lib/searchFilterLabels";
import { expenseSearchFormToSearchParams, type ExpenseSearchFormState } from "../lib/searchParams";

type SearchEntry = { id: string; name?: string; query: string };

function readEntries(value: unknown): { saved: SearchEntry[]; recent: SearchEntry[] } {
  if (typeof value !== "object" || value === null) return { saved: [], recent: [] };
  const { saved, recent } = value as { saved?: unknown; recent?: unknown };
  return {
    saved: Array.isArray(saved) ? (saved as SearchEntry[]) : [],
    recent: Array.isArray(recent) ? (recent as SearchEntry[]) : [],
  };
}

/** 検索条件の保存、保存した検索・最近の検索の再適用と削除。 */
export function SavedExpenseSearches({
  applied,
  isValid,
}: {
  applied: ExpenseSearchFormState;
  isValid: boolean;
}) {
  const navigate = useNavigate();
  const listQuery = useQuery(api.savedExpenseSearches.queries.listSavedExpenseSearches);
  const { saved, recent } = readEntries(listQuery);
  const saveSearch = useMutation(api.savedExpenseSearches.mutations.saveExpenseSearch);
  const deleteSearch = useMutation(api.savedExpenseSearches.mutations.deleteSavedExpenseSearch);

  // 表示名の要約でカテゴリ名を引く。カテゴリを含む条件が無いときは購読しない。
  const needsCategories = [...saved, ...recent].some((entry) =>
    new URLSearchParams(entry.query).has("categoryId"),
  );
  const categoriesQuery = useQuery(
    api.categories.queries.listForSettings,
    needsCategories ? {} : "skip",
  );
  const categoryNames = useMemo(() => {
    if (!Array.isArray(categoriesQuery)) return undefined;
    return new Map<string, string>(
      (categoriesQuery as Array<{ _id: string; name: string; isActive?: boolean }>).map(
        (category) => [
          category._id,
          category.isActive === false ? `${category.name}（無効化済み）` : category.name,
        ],
      ),
    );
  }, [categoriesQuery]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [actionError, setActionError] = useState("");

  const canSave = isValid && hasSearchCondition(applied);
  const trimmedName = name.trim();
  const nameTooLong = trimmedName.length > MAX_SAVED_SEARCH_NAME_LENGTH;

  const openDialog = () => {
    setName("");
    setDialogError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setDialogError("");
    try {
      await saveSearch({
        name: trimmedName,
        query: expenseSearchFormToSearchParams(applied).toString(),
      });
      setDialogOpen(false);
    } catch (error) {
      setDialogError(getConvexErrorMessage(error, "検索条件を保存できませんでした。"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: SearchEntry) => {
    setActionError("");
    try {
      await deleteSearch({ savedExpenseSearchId: entry.id as Id<"savedExpenseSearches"> });
    } catch (error) {
      setActionError(getConvexErrorMessage(error, "保存した検索を削除できませんでした。"));
    }
  };

  const apply = (entry: SearchEntry) => navigate(`/search?${entry.query}`);

  return (
    <Stack spacing={2}>
      <Stack>
        <Button
          disabled={!canSave}
          onClick={openDialog}
          sx={{ alignSelf: "flex-start", minHeight: 44 }}
          variant="outlined"
        >
          この条件を保存
        </Button>
      </Stack>

      {actionError ? (
        <Alert onClose={() => setActionError("")} severity="error" variant="outlined">
          {actionError}
        </Alert>
      ) : null}

      {saved.length > 0 ? (
        <Stack spacing={0.5}>
          <Typography component="h2" variant="subtitle1">
            保存した検索
          </Typography>
          <List aria-label="保存した検索" dense disablePadding>
            {saved.map((entry) => (
              <ListItem
                disablePadding
                key={entry.id}
                secondaryAction={
                  <IconButton
                    aria-label={`${entry.name ?? "保存した検索"}を保存した検索から削除`}
                    edge="end"
                    onClick={() => void handleDelete(entry)}
                    sx={{ width: 44, height: 44 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => apply(entry)} sx={{ minHeight: 44 }}>
                  <ListItemText
                    primary={entry.name}
                    secondary={summarizeSearchQuery(entry.query, categoryNames)}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Stack>
      ) : null}

      {recent.length > 0 ? (
        <Stack spacing={0.5}>
          <Typography component="h2" variant="subtitle1">
            最近の検索
          </Typography>
          <List aria-label="最近の検索" dense disablePadding>
            {recent.map((entry) => (
              <ListItem disablePadding key={entry.id}>
                <ListItemButton onClick={() => apply(entry)} sx={{ minHeight: 44 }}>
                  <ListItemText primary={summarizeSearchQuery(entry.query, categoryNames)} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Stack>
      ) : null}

      <Dialog
        aria-labelledby="save-expense-search-title"
        fullWidth
        maxWidth="xs"
        onClose={() => (saving ? undefined : setDialogOpen(false))}
        open={dialogOpen}
      >
        <DialogTitle id="save-expense-search-title">検索条件を保存</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography color="text.secondary" variant="body2">
              {summarizeSearchQuery(
                expenseSearchFormToSearchParams(applied).toString(),
                categoryNames,
              )}
            </Typography>
            {dialogError ? (
              <Alert severity="error" variant="outlined">
                {dialogError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              error={nameTooLong}
              fullWidth
              helperText={
                nameTooLong
                  ? `名前は${MAX_SAVED_SEARCH_NAME_LENGTH}文字以内で入力してください`
                  : `${MAX_SAVED_SEARCH_NAME_LENGTH}文字まで`
              }
              label="名前"
              onChange={(event) => setName(event.target.value)}
              placeholder="例: 先月の食費"
              value={name}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDialogOpen(false)} type="button">
            キャンセル
          </Button>
          <Button
            disabled={saving || trimmedName.length === 0 || nameTooLong}
            onClick={() => void handleSave()}
            type="button"
            variant="contained"
          >
            {saving ? "保存中…" : "保存する"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
