import { Box, Stack, Typography } from "@mui/material";
import type { ProductUpdate } from "../../../../lib/domain/productUpdates";
import { formatJapaneseDate } from "../../../utils/date";

export type ProductUpdateItemProps = {
  update: ProductUpdate;
};

export function ProductUpdateItem({ update }: ProductUpdateItemProps) {
  return (
    <Stack spacing={1}>
      <Typography color="text.secondary" variant="body2">
        {formatJapaneseDate(update.publishedAt)}
      </Typography>
      <Typography component="h2" variant="h6">
        {update.title}
      </Typography>
      <Typography color="text.secondary" variant="caption">
        Version {update.version}
      </Typography>
      <Typography variant="body1">{update.summary}</Typography>
      {update.items && update.items.length > 0 ? (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {update.items.map((item, index) => (
            <Typography component="li" key={index} variant="body2">
              {item}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}
