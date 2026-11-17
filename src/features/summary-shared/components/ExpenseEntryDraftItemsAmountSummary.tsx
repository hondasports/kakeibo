import { api } from "../../../../convex/_generated/api";
import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  summarizeEditedDraftItemsAmount,
  type EditedDraftItemsAmountSummary,
} from "../../../../lib/domain/aiExpenseDrafts/editedDraftItemsAmountSummary";
import { getAmountBasisLabel } from "../../../../lib/domain/aiExpenseDrafts/receiptTaxLabels";
import type { ReviewAmountCheck } from "../../../../lib/domain/aiExpenseDrafts/reviewAmountChecks";
import type { AiExpenseDraftWithItems } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import {
  AmountCheckBody,
  AmountCheckLine,
  CheckCard,
  getAmountCheckHeadline,
} from "../../receipt-review/components/ReviewCheckCards";
import type { EditableDraftItem } from "./ExpenseEntryDraftItemsEditor";

function AmountBasisLine({
  amountBasis,
}: {
  amountBasis: EditedDraftItemsAmountSummary["amountBasis"];
}) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        明細の金額
      </Typography>
      <Typography variant="body2">
        {amountBasis === "mixed" ? "税込と税抜が混在" : getAmountBasisLabel(amountBasis)}
      </Typography>
    </Stack>
  );
}

/** 一致しているときの内訳。外税は「明細合計（税抜）＋税額＝支払額」、内税は「明細合計＝支払額」。 */
function MatchedAmountLines({ check }: { check: ReviewAmountCheck }) {
  if (check.variant === "external") {
    return (
      <>
        <AmountCheckLine label="明細合計（税抜）" value={check.itemsPrintedTotalYen} />
        <AmountCheckLine label="税額" value={check.printedTaxYen} />
        <AmountCheckLine label="支払額" value={check.paidTotalYen} />
      </>
    );
  }
  return (
    <>
      <AmountCheckLine label="明細合計" value={check.itemsComparableTotalYen} />
      <AmountCheckLine label="支払額" value={check.paidTotalYen} />
    </>
  );
}

/**
 * 「明細ごとに保存」の編集ダイアログで、明細の合計と金額（支払額）の関係を示す。
 * 判定は下書きの確認画面と同じ正本から取り、ここでは税を計算しない。
 */
export function DraftItemsAmountSummary({
  draftId,
  amountYen,
  categoryId,
  draftItems,
}: {
  draftId: Id<"aiExpenseDrafts">;
  amountYen: string;
  categoryId: string;
  draftItems: EditableDraftItem[];
}) {
  const details = useQuery(api.aiExpenseDrafts.queries.getWithItems, { draftId }) as
    | AiExpenseDraftWithItems
    | null
    | undefined;
  const summary = useMemo(
    () =>
      details
        ? summarizeEditedDraftItemsAmount({
            draft: details.draft,
            savedItems: details.items,
            amountYen,
            categoryId,
            items: draftItems,
          })
        : null,
    [details, amountYen, categoryId, draftItems],
  );
  if (!summary) return null;
  const { amount, amountBasis } = summary;
  return (
    <Box component="section" aria-label="明細と金額の確認">
      <CheckCard title="金額確認" status={amount.status}>
        <Stack spacing={0.5}>
          <Typography variant="body2">{getAmountCheckHeadline(amount)}</Typography>
          {amount.status === "matched" ? (
            <MatchedAmountLines check={amount} />
          ) : (
            <>
              {amount.status === "uncomparable" && amount.itemsPrintedTotalYen !== undefined ? (
                <AmountCheckLine label="明細合計" value={amount.itemsPrintedTotalYen} />
              ) : null}
              <AmountCheckBody check={amount} />
            </>
          )}
          <AmountBasisLine amountBasis={amountBasis} />
        </Stack>
      </CheckCard>
    </Box>
  );
}
