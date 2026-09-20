import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../utils/currency";
import type { ReviewGuidanceItem } from "../../utils/reviewGuidance";
import type { ReviewAmountCheck, ReviewChecks } from "../../utils/reviewChecks";

function yen(value: number | undefined): string {
  return value === undefined ? "未確定" : formatYen(value);
}

function amountMismatchLine(check: ReviewAmountCheck): string | undefined {
  switch (check.mismatchStep) {
    case "itemsVsSubtotal":
      return `明細合計 ${yen(check.itemsPrintedTotalYen)} ／ 印字小計 ${yen(check.printedSubtotalYen)}`;
    case "subtotalTaxVsPaid":
      return `小計＋税額 ${yen(check.expectedPaidYen)} ／ 支払額 ${yen(check.paidTotalYen)}`;
    case "itemsVsPaid":
      return `明細合計 ${yen(check.itemsComparableTotalYen)} ／ 支払額 ${yen(check.paidTotalYen)}`;
    default:
      return undefined;
  }
}

export function ReviewStatusBanner({
  checks,
  issues,
  unresolvedTaxItemCount,
  busy,
  onJump,
}: {
  checks: ReviewChecks;
  /** 明細・基本情報など特定箇所への確認・修正項目 */
  issues: ReviewGuidanceItem[];
  /** 税率または税込／税抜が未確定の明細数 */
  unresolvedTaxItemCount: number;
  busy: boolean;
  onJump: (target: string) => void;
}) {
  const { amount, taxRate } = checks;
  const checksAreMatched = amount.status === "matched" && taxRate.status === "matched";
  const sharedBlockerCode =
    amount.status === "uncomparable" &&
    taxRate.status === "uncomparable" &&
    amount.blockerCode === taxRate.blockerCode
      ? amount.blockerCode
      : undefined;
  const combineUncomparable =
    sharedBlockerCode === "unresolved-tax" || sharedBlockerCode === "basis-conflict";
  const combinedAffectedItemCount = new Set([
    ...(amount.affectedItemIds ?? []),
    ...(taxRate.affectedItemIds ?? []),
  ]).size;
  const combinedItemCount = combinedAffectedItemCount || unresolvedTaxItemCount;

  return (
    <Stack spacing={1.5} component="section" aria-label="全体の確認状態">
      {amount.status === "mismatch" && (
        <Alert severity="error">
          <Typography variant="subtitle2">印字額と明細の金額が一致していません</Typography>
          <Typography variant="body2">
            {amountMismatchLine(amount)}
            {amount.differenceYen !== undefined &&
              ` ／ 差額 ${formatYen(Math.abs(amount.differenceYen))}`}
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(amount.focusTarget ?? "items")}
            >
              金額を確認する
            </Button>
          </Box>
        </Alert>
      )}
      {combineUncomparable && (
        <Alert severity="warning">
          <Typography variant="subtitle2">
            {sharedBlockerCode === "basis-conflict"
              ? "商品の税込／税抜設定が、レシートの税内訳と一致していません"
              : "税率・税込／税抜が未確定の商品があります"}
          </Typography>
          <Typography variant="body2">
            {sharedBlockerCode === "basis-conflict"
              ? `税込／税抜の設定が一致していない商品が${combinedItemCount}件あります。商品ごとに確認してください。`
              : `税率・税込／税抜が未確定の商品が${combinedItemCount}件あります。商品ごとに確認してください。`}
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(taxRate.focusTarget ?? amount.focusTarget ?? "items")}
            >
              {sharedBlockerCode === "basis-conflict"
                ? "該当商品を確認する"
                : "未確定の商品を確認する"}
            </Button>
          </Box>
        </Alert>
      )}
      {amount.status === "uncomparable" && !combineUncomparable && (
        <Alert severity="warning">
          <Typography variant="subtitle2">金額を比較できません</Typography>
          <Typography variant="body2">
            {amount.reason ?? "比較に必要な情報が不足しています"}。レシートと照合してください。
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(amount.focusTarget ?? "items")}
            >
              金額を確認する
            </Button>
          </Box>
        </Alert>
      )}
      {checksAreMatched && (
        <Alert severity="success">印字額と明細の金額が一致しています。</Alert>
      )}
      {issues.length > 0 && (
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
          {issues.map((issue) => (
            <Box component="li" key={issue.id}>
              <Typography
                component="span"
                variant="body2"
                color={issue.required ? "error.main" : "text.secondary"}
              >
                {issue.message}
              </Typography>{" "}
              <Button
                disabled={busy}
                type="button"
                size="small"
                onClick={() => onJump(issue.target)}
              >
                {issue.required ? "修正箇所へ" : "確認箇所へ"}
              </Button>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
