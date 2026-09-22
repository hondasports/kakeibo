import { api } from "../../../../convex/_generated/api";
import { useEffect } from "react";
import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { sanitizeSignedYenInput } from "../../../../lib/domain/receipt/discountItems";

export type CategoryOption = {
  _id: string;
  name: string;
};

export type EditableDraftItem = {
  itemId?: Id<"aiExpenseDraftItems">;
  itemName: string;
  amountYen: string;
  categoryId: string;
};

export function DraftItemsLoader({
  draftId,
  setDraftItems,
  setDraftItemsLoading,
}: {
  draftId: Id<"aiExpenseDrafts">;
  setDraftItems: (items: EditableDraftItem[]) => void;
  setDraftItemsLoading: (loading: boolean) => void;
}) {
  const draftDetails = useQuery(api.aiExpenseDrafts.queries.getWithItems, { draftId });
  useEffect(() => {
    if (draftDetails === undefined) return;
    setDraftItems(
      (draftDetails?.items ?? []).map((item) => ({
        itemId: item._id,
        itemName: item.itemName,
        amountYen: String(item.printedAmountYen ?? item.normalizedAmountYen ?? item.amountYen),
        categoryId: item.categoryId ?? "",
      })),
    );
    setDraftItemsLoading(false);
  }, [draftDetails, setDraftItems, setDraftItemsLoading]);
  return null;
}

export function DraftItemsEditor({
  categories,
  categoryId,
  draftItems,
  draftItemsLoading,
  setDraftItems,
}: {
  categories: CategoryOption[];
  categoryId: string;
  draftItems: EditableDraftItem[];
  draftItemsLoading: boolean;
  setDraftItems: React.Dispatch<React.SetStateAction<EditableDraftItem[]>>;
}) {
  return (
    <Stack aria-label="登録明細" spacing={1.5}>
      <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
        登録明細
      </Typography>
      {draftItemsLoading ? (
        <Typography color="text.secondary" variant="body2">
          明細を読み込んでいます。
        </Typography>
      ) : draftItems.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          保存済みの明細はありません。レシート合計を1件の支出として登録します。
        </Typography>
      ) : (
        draftItems.map((item, index) => (
          <Stack key={item.itemId ?? index} spacing={1}>
            <TextField
              fullWidth
              label={`明細名 ${index + 1}`}
              onChange={(event) =>
                setDraftItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index
                      ? { ...currentItem, itemName: event.target.value }
                      : currentItem,
                  ),
                )
              }
              value={item.itemName}
            />
            <TextField
              fullWidth
              label={`明細金額 ${index + 1}`}
              onChange={(event) =>
                setDraftItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index
                      ? {
                          ...currentItem,
                          amountYen: sanitizeSignedYenInput(
                            currentItem.itemName,
                            event.target.value,
                          ),
                        }
                      : currentItem,
                  ),
                )
              }
              slotProps={{ htmlInput: { inputMode: "text" } }}
              value={item.amountYen}
            />
            <TextField
              fullWidth
              label={`明細カテゴリ ${index + 1}`}
              onChange={(event) =>
                setDraftItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index
                      ? { ...currentItem, categoryId: event.target.value }
                      : currentItem,
                  ),
                )
              }
              select
              value={item.categoryId}
            >
              {categories.map((category) => (
                <MenuItem key={category._id} value={category._id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              color="error"
              onClick={() =>
                setDraftItems((current) =>
                  current.filter((_, currentIndex) => currentIndex !== index),
                )
              }
              type="button"
              variant="text"
            >
              明細{index + 1}を削除
            </Button>
          </Stack>
        ))
      )}
      <Button
        onClick={() =>
          setDraftItems((current) => [
            ...current,
            {
              itemName: "",
              amountYen: "",
              categoryId,
            },
          ])
        }
        type="button"
        variant="outlined"
      >
        明細を追加
      </Button>
    </Stack>
  );
}
