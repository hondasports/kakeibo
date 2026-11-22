import { Box, Divider, Stack, Typography } from "@mui/material";
import type { ProductUpdate } from "../../../../lib/domain/productUpdates";
import { ProductUpdateItem } from "./ProductUpdateItem";

type ProductUpdateListProps = {
  productUpdates: ProductUpdate[];
};

export function ProductUpdateList({ productUpdates }: ProductUpdateListProps) {
  if (productUpdates.length === 0) {
    return (
      <Box>
        <Typography variant="body1">まだ公開された更新履歴はありません。</Typography>
        <Typography color="text.secondary" variant="body2">
          今後の新機能や改善内容はこちらでお知らせします。
        </Typography>
      </Box>
    );
  }

  // 掲載日(publishedAt)の降順はここで保証する（生成済みJSONの配列順には依存しない）
  const sortedUpdates = [...productUpdates].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  return (
    <Stack divider={<Divider />} spacing={3}>
      {sortedUpdates.map((update) => (
        <ProductUpdateItem key={update.id} update={update} />
      ))}
    </Stack>
  );
}
