import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import type { ReviewGuidanceItem } from "../../../../lib/domain/aiExpenseDrafts/reviewGuidance";
import type { ReviewChecks } from "../../../../lib/domain/aiExpenseDrafts/reviewChecks";

export function ReviewStatusBanner({
  checks,
  amountTaxResolved = true,
  issues,
  unresolvedTaxItemCount,
  receiptIssues = [],
  busy,
  onJump,
}: {
  checks: ReviewChecks;
  amountTaxResolved?: boolean;
  /** 明細・基本情報など特定箇所への確認・修正項目 */
  issues: ReviewGuidanceItem[];
  /** 税率または税込／税抜が未確定の明細数 */
  unresolvedTaxItemCount: number;
  /** レシート全体の読み取り確認 */
  receiptIssues?: ReviewGuidanceItem[];
  busy: boolean;
  onJump: (target: string) => void;
}) {
  const { amount, taxRate } = checks;
  const checksAreMatched =
    amountTaxResolved && amount.status === "matched" && taxRate.status === "matched";
  const sharedBlockerCode =
    amount.status === "uncomparable" &&
    taxRate.status === "uncomparable" &&
    amount.blockerCode === taxRate.blockerCode
      ? amount.blockerCode
      : undefined;
  const combineUncomparable =
    sharedBlockerCode === "unresolved-tax" ||
    sharedBlockerCode === "basis-conflict" ||
    sharedBlockerCode === "unverified-tax-summary";
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
            {amount.differenceYen === undefined
              ? "商品一覧の金額確認と、商品の税込／税抜・税率を確認してください。"
              : `${amount.mismatchStep === "itemsVsSubtotal" ? "商品の合計とレシートの小計" : amount.mismatchStep === "subtotalTaxVsPaid" ? "レシートの小計と税額の合計と支払額" : "商品の合計と支払額"}が${formatYen(Math.abs(amount.differenceYen))}合いません。商品の税込／税抜・税率を確認してください。`}
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
            {sharedBlockerCode === "unverified-tax-summary"
              ? "商品の金額を確認してください"
              : sharedBlockerCode === "basis-conflict"
                ? "商品の税込／税抜設定が、レシートの税内訳と一致していません"
                : "税設定の確認が必要な商品があります"}
          </Typography>
          <Typography variant="body2">
            {sharedBlockerCode === "unverified-tax-summary"
              ? "商品の金額・税込／税抜・税率をレシートと照合してください。"
              : sharedBlockerCode === "basis-conflict"
                ? `税込／税抜の設定が一致していない商品が${combinedItemCount}件あります。商品ごとに確認してください。`
                : `税設定の確認が必要な商品が${combinedItemCount}件あります。商品ごとに確認してください。`}
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(taxRate.focusTarget ?? amount.focusTarget ?? "items")}
            >
              {sharedBlockerCode === "unverified-tax-summary"
                ? "商品とレシートを確認する"
                : sharedBlockerCode === "basis-conflict"
                  ? "該当商品を確認する"
                  : "税設定を確認する"}
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
      {taxRate.status === "mismatch" && (
        <Alert severity="error">
          <Typography variant="subtitle2">商品の税率を確認してください</Typography>
          <Typography variant="body2">
            レシートの税内訳と、商品の税率設定が一致していません。
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
      {taxRate.status === "uncomparable" && !combineUncomparable && (
        <Alert severity="warning">
          <Typography variant="subtitle2">
            {taxRate.blockerCode === "unverified-tax-summary"
              ? "商品の金額を確認してください"
              : "商品の税率を確認してください"}
          </Typography>
          <Typography variant="body2">
            {taxRate.reason ?? "商品の税率または税込／税抜設定を、レシートと照合してください。"}
          </Typography>
          <Box>
            <Button
              disabled={busy}
              size="small"
              type="button"
              onClick={() => onJump(taxRate.focusTarget ?? "items")}
            >
              {taxRate.blockerCode === "unverified-tax-summary"
                ? "商品とレシートを確認する"
                : "税率を確認する"}
            </Button>
          </Box>
        </Alert>
      )}
      {checksAreMatched && issues.length === 0 && (
        <Alert severity="success">印字額と明細の金額が一致しています。</Alert>
      )}
      {checksAreMatched && issues.length > 0 && (
        <Box
          aria-live="polite"
          sx={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          印字額と明細の金額が一致しています。
        </Box>
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
      {!checksAreMatched &&
        receiptIssues.map((issue) => (
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
