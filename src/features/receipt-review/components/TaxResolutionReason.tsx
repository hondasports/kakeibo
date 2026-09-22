import { Stack, Typography } from "@mui/material";
import type { TaxContextResolution } from "../../../../lib/receiptTax/types";
import { getReviewReasonLabel, getTaxResolutionSourceLabel } from "../utils/receiptTaxLabels";

export function TaxResolutionReason({ context }: { context: TaxContextResolution }) {
  if (context.status === "unresolved") {
    return (
      <Stack component="ul" spacing={0.25} sx={{ listStyle: "disc", m: 0, pl: 2 }}>
        {context.reasons.map((reason) => (
          <Typography component="li" key={reason} variant="body2">
            {getReviewReasonLabel(reason)}
          </Typography>
        ))}
      </Stack>
    );
  }

  return <Typography variant="body2">{getTaxResolutionSourceLabel(context.source)}</Typography>;
}
