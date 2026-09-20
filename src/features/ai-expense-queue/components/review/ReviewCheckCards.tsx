import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../utils/currency";
import { getTaxModeLabel } from "../../utils/receiptItemTaxViewModel";
import type {
  ReviewAmountCheck,
  ReviewCheckStatus,
  ReviewTaxRateCheck,
} from "../../utils/reviewChecks";

const STATUS_LABEL: Record<ReviewCheckStatus, string> = {
  matched: "一致",
  mismatch: "不一致",
  uncomparable: "比較不能",
};

function StatusChip({ status }: { status: ReviewCheckStatus }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={status === "matched" ? "success" : status === "mismatch" ? "error" : "warning"}
      icon={
        status === "matched" ? (
          <CheckCircleIcon />
        ) : status === "mismatch" ? (
          <ErrorIcon />
        ) : (
          <WarningAmberIcon />
        )
      }
      label={STATUS_LABEL[status]}
    />
  );
}

function yen(value: number | undefined): string {
  return value === undefined ? "未確定" : formatYen(value);
}

function CheckCard({
  title,
  status,
  children,
}: {
  title: string;
  status: ReviewCheckStatus;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor:
          status === "matched" ? "success.main" : status === "mismatch" ? "error.main" : "divider",
        borderRadius: 1.5,
        p: 1.5,
        minWidth: 0,
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography component="h4" variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <StatusChip status={status} />
      </Stack>
      {children}
    </Box>
  );
}

function AmountCheckBody({ check }: { check: ReviewAmountCheck }) {
  const numericSx = {
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    textAlign: "right",
  } as const;
  const Line = ({ label, value }: { label: string; value: number | undefined }) => (
    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={numericSx}>
        {yen(value)}
      </Typography>
    </Stack>
  );

  if (check.status === "uncomparable") {
    return (
      <Typography variant="body2" color="text.secondary">
        {check.reason ?? "比較に必要な情報が不足しています"}
      </Typography>
    );
  }

  if (check.variant === "external") {
    if (check.status === "matched") {
      return (
        <Typography variant="body2" sx={{ textAlign: "right" }}>
          <Box component="span" sx={numericSx}>
            明細合計 {yen(check.itemsPrintedTotalYen)}
          </Box>{" "}
          <Box component="span" sx={numericSx}>
            ＋ 税額 {yen(check.printedTaxYen)}
          </Box>{" "}
          <Box component="span" sx={numericSx}>
            ＝ 支払額 {yen(check.paidTotalYen)}
          </Box>
        </Typography>
      );
    }
    return (
      <Stack spacing={0.5}>
        {check.mismatchStep === "itemsVsSubtotal" ? (
          <>
            <Line label="明細合計" value={check.itemsPrintedTotalYen} />
            <Line label="印字小計（税抜）" value={check.printedSubtotalYen} />
          </>
        ) : (
          <>
            <Line label="小計＋税額" value={check.expectedPaidYen} />
            <Line label="支払額" value={check.paidTotalYen} />
          </>
        )}
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
          <Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>
            差額
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ ...numericSx, fontWeight: 700 }}>
            {yen(check.differenceYen === undefined ? undefined : Math.abs(check.differenceYen))}
          </Typography>
        </Stack>
      </Stack>
    );
  }

  if (check.status === "matched") {
    return (
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        <Box component="span" sx={numericSx}>
          明細合計 {yen(check.itemsComparableTotalYen)}
        </Box>{" "}
        <Box component="span" sx={numericSx}>
          ＝ 支払額 {yen(check.paidTotalYen)}
        </Box>
      </Typography>
    );
  }
  return (
    <Stack spacing={0.5}>
      <Line label="明細合計" value={check.itemsComparableTotalYen} />
      <Line label="支払額" value={check.paidTotalYen} />
      <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
        <Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>
          差額
        </Typography>
        <Typography variant="body2" color="error.main" sx={{ ...numericSx, fontWeight: 700 }}>
          {yen(check.differenceYen === undefined ? undefined : Math.abs(check.differenceYen))}
        </Typography>
      </Stack>
    </Stack>
  );
}

function TaxRateCheckBody({ check }: { check: ReviewTaxRateCheck }) {
  if (check.rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {check.reason ?? "税率別の対象額が読み取れていません"}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.5}>
      {check.rows.map((row, index) => (
        <Box key={`${row.taxRatePercent}-${index}`}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", gap: 1, alignItems: "baseline" }}
          >
            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
              {row.taxRatePercent}%
              {row.taxMode ? ` ${getTaxModeLabel(row.taxMode)}` : "（印字なし）"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                textAlign: "right",
                color: row.status === "mismatch" ? "error.main" : undefined,
              }}
            >
              現在 {yen(row.currentYen)} ／ 印字 {yen(row.printedYen)}
            </Typography>
          </Stack>
          {row.status === "mismatch" && row.differenceYen !== undefined && (
            <Typography
              variant="caption"
              color="error.main"
              sx={{ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            >
              差額 {formatYen(Math.abs(row.differenceYen))}
            </Typography>
          )}
          {row.status === "uncomparable" && row.reason && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {row.reason}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}

export function ReviewCheckCards({
  amount,
  taxRate,
}: {
  amount: ReviewAmountCheck;
  taxRate: ReviewTaxRateCheck;
}) {
  return (
    <Box
      component="section"
      aria-label="確認結果"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "minmax(0,1fr) minmax(0,1fr)" },
        gap: 1.5,
      }}
    >
      <CheckCard title="金額確認" status={amount.status}>
        <AmountCheckBody check={amount} />
      </CheckCard>
      <CheckCard title="税率別集計" status={taxRate.status}>
        <TaxRateCheckBody check={taxRate} />
      </CheckCard>
    </Box>
  );
}
