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
  receiptIssues,
  busy,
  onJump,
}: {
  checks: ReviewChecks;
  /** 明細・基本情報など特定箇所への確認・修正項目 */
  issues: ReviewGuidanceItem[];
  /** レシート全体の読み取り確認 */
  receiptIssues: ReviewGuidanceItem[];
  busy: boolean;
  onJump: (target: string) => void;
}) {
  const { amount, taxRate } = checks;
  const mismatchedTaxRows = taxRate.rows.filter((row) => row.status === "mismatch");

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
      {amount.status === "uncomparable" && (
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
      {taxRate.status === "mismatch" && (
        <Alert severity="error">
          <Typography variant="subtitle2">税率別の明細合計が一致していません</Typography>
          {mismatchedTaxRows.map((row) => (
            <Typography variant="body2" key={row.taxRatePercent}>
              {row.taxRatePercent}%：現在 {yen(row.currentYen)} ／ 印字 {yen(row.printedYen)}
            </Typography>
          ))}
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(taxRate.focusTarget ?? "items")}
            >
              税率を確認する
            </Button>
          </Box>
        </Alert>
      )}
      {taxRate.status === "uncomparable" && (
        <Alert severity="warning">
          <Typography variant="subtitle2">税率別の明細合計を比較できません</Typography>
          <Typography variant="body2">
            {taxRate.reason ?? "税率別の対象額が読み取れていません"}。レシートと照合してください。
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(taxRate.focusTarget ?? "items")}
            >
              税率を確認する
            </Button>
          </Box>
        </Alert>
      )}
      {amount.status === "matched" && taxRate.status === "matched" && (
        <Alert severity="success">
          印字額と明細の金額が一致しています。OCRの読み取りがすべて正しいことを保証するものではありません。
        </Alert>
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
      {receiptIssues.map((issue) => (
        <Alert key={issue.id} severity="info">
          <Typography variant="subtitle2">レシート全体の確認</Typography>
          {issue.message}
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(issue.target)}
            >
              商品一覧を見比べる
            </Button>
          </Box>
        </Alert>
      ))}
    </Stack>
  );
}
