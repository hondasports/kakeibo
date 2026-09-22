import DeleteIcon from "@mui/icons-material/Delete";
import { Button } from "@mui/material";
import type { AiExpenseQueueItem } from "../../../../types/aiExpenseQueue";

export function DeleteQueueButton({
  item,
  onDelete,
  isDeleting,
  sx,
}: {
  item: AiExpenseQueueItem;
  onDelete?: (item: AiExpenseQueueItem) => void;
  isDeleting: boolean;
  sx?: object;
}) {
  return (
    <Button
      color="error"
      disabled={isDeleting}
      onClick={() => onDelete?.(item)}
      size="small"
      startIcon={<DeleteIcon fontSize="small" />}
      type="button"
      variant="text"
      sx={sx}
    >
      一覧から削除
    </Button>
  );
}
