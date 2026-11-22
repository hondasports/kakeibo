import { api } from "../../../../convex/_generated/api";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  buildExportCsv,
  splitDateRangeIntoMonths,
  type ExportCsvRow,
  type ExportEntryKind,
} from "../../../../lib/domain/export/exportCsv";

type EntryTypeFilter = "all" | ExportEntryKind;

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end: end.toISOString().slice(0, 10) };
}

function downloadCsv(fileName: string, csv: string) {
  // BOM付きUTF-8: Excelで開いたときの文字化けを防ぐ。
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPage() {
  const convex = useConvex();
  const [range] = useState(currentMonthRange);
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [entryType, setEntryType] = useState<EntryTypeFilter>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  const rangeInvalid = Boolean(startDate && endDate && startDate > endDate);
  const canRun = startDate !== "" && endDate !== "" && !rangeInvalid && !isExporting;

  const handleExport = async () => {
    setError("");
    setDoneMessage("");
    setIsExporting(true);
    try {
      const rows: ExportCsvRow[] = [];
      const chunks = splitDateRangeIntoMonths(startDate, endDate);
      for (const chunk of chunks) {
        const result = await convex.query(api.dataExport.listExportEntries, {
          startDate: chunk.startDate,
          endDate: chunk.endDate,
          entryType: entryType === "all" ? undefined : entryType,
        });
        if (result.truncated) {
          throw new Error(
            `${chunk.startDate.slice(0, 7)} の明細が1か月あたりの上限を超えています。期間を短くして再度お試しください`,
          );
        }
        rows.push(...result.rows);
      }
      if (rows.length === 0) {
        setDoneMessage("指定期間の明細はありませんでした");
        return;
      }
      const fileName = `suzumemo-export-${startDate.replaceAll("-", "")}-${endDate.replaceAll("-", "")}.csv`;
      downloadCsv(fileName, buildExportCsv(rows));
      setDoneMessage(`${rows.length}件を${fileName}として保存しました`);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== ""
          ? cause.message
          : "データの書き出しに失敗しました",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h5">
            データの書き出し
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
            現在のグループの支出・収入をCSVで書き出します。バックアップや他サービスへの移行に使えます。
          </Typography>
        </Box>

        <Paper className="settings-ledger-section" elevation={0} sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="開始日"
                onChange={(event) => setStartDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                type="date"
                value={startDate}
              />
              <TextField
                error={rangeInvalid}
                fullWidth
                helperText={rangeInvalid ? "開始日は終了日以前の日付を指定してください" : " "}
                label="終了日"
                onChange={(event) => setEndDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                type="date"
                value={endDate}
              />
              <TextField
                fullWidth
                label="対象データ"
                onChange={(event) => setEntryType(event.target.value as EntryTypeFilter)}
                select
                value={entryType}
              >
                <MenuItem value="all">支出と収入</MenuItem>
                <MenuItem value="expense">支出のみ</MenuItem>
                <MenuItem value="income">収入のみ</MenuItem>
              </TextField>
            </Stack>

            {isExporting && <LinearProgress aria-label="書き出し中" />}
            {error && (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            )}
            {doneMessage && (
              <Alert severity="success" variant="outlined">
                {doneMessage}
              </Alert>
            )}

            <Stack direction="row" spacing={1.5}>
              <Button
                disabled={!canRun}
                onClick={() => void handleExport()}
                sx={{ minHeight: 44 }}
                variant="contained"
              >
                {isExporting ? "書き出し中…" : "CSVをダウンロード"}
              </Button>
              <Button component={RouterLink} sx={{ minHeight: 44 }} to="/settings" variant="text">
                設定へ戻る
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
