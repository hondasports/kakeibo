import { api } from "../../../../convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import type { ExpenseEntryPrefill } from "../types/prefill";

type EntryFavorite = {
  id: string;
  title: string;
  categoryId: string;
  amountYen: number;
  memo?: string;
};

export function EntryFavoritesDialog({
  categoryNames,
  open,
  onApply,
  onClose,
}: {
  categoryNames: Map<string, string>;
  open: boolean;
  onApply: (prefill: ExpenseEntryPrefill) => void;
  onClose: () => void;
}) {
  const favorites = useQuery(api.entryFavorites.queries.listEntryFavorites);
  const deleteFavorite = useMutation(api.entryFavorites.mutations.deleteEntryFavorite);
  const [actionError, setActionError] = useState("");

  const handleDelete = async (entryFavoriteId: string) => {
    setActionError("");
    try {
      await deleteFavorite({
        entryFavoriteId: entryFavoriteId as never,
      });
    } catch {
      setActionError("お気に入りの削除に失敗しました");
    }
  };

  return (
    <Dialog aria-label="お気に入りから入力" fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>お気に入りから入力</DialogTitle>
      <DialogContent>
        {actionError && (
          <Alert severity="error" sx={{ mb: 1 }} variant="outlined">
            {actionError}
          </Alert>
        )}
        {favorites === undefined ? (
          <Typography color="text.secondary" variant="body2">
            読み込んでいます…
          </Typography>
        ) : favorites.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            お気に入りはまだありません。「お気に入りに保存」で登録できます。
          </Typography>
        ) : (
          <List>
            {(favorites as EntryFavorite[]).map((favorite) => (
              <ListItem
                key={favorite.id}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      onClick={() =>
                        onApply({
                          title: favorite.title,
                          categoryId: favorite.categoryId,
                          amountYen: favorite.amountYen,
                          memo: favorite.memo,
                        })
                      }
                      size="small"
                      type="button"
                    >
                      選ぶ
                    </Button>
                    <IconButton
                      aria-label={`${favorite.title}をお気に入りから削除`}
                      edge="end"
                      onClick={() => void handleDelete(favorite.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemText
                  primary={`${favorite.title} ${formatYen(favorite.amountYen)}`}
                  secondary={categoryNames.get(favorite.categoryId) ?? "不明なカテゴリ"}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} type="button">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
