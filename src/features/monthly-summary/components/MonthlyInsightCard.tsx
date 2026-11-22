import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";

/**
 * 月次インサイト。生成は利用者のボタン押下時のみ（自動生成しない）。
 * 外部に送信するのはカテゴリ別集計値のみ。明細・店名・識別子は送らない。
 */
export function MonthlyInsightCard({ month }: { month: string }) {
  const insight = useQuery(api.monthlyInsights.index.getMonthlyInsight, { month });
  const generate = useAction(api.monthlyInsights.index.generateMonthlyInsight);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generate({ month });
    } catch {
      setError("インサイトを生成できませんでした。時間をおいて再試行してください。");
    } finally {
      setGenerating(false);
    }
  };

  if (insight === undefined) return null;

  const generationLimitReached = insight !== null && (insight.generationCount ?? 1) >= 3;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography component="h2" variant="h6">
            AI月次インサイト
          </Typography>
          {insight ? (
            <Typography sx={{ whiteSpace: "pre-wrap" }} variant="body2">
              {insight.commentText}
            </Typography>
          ) : (
            <Typography color="text.secondary" variant="body2">
              この月の傾向コメントはまだ生成されていません。
            </Typography>
          )}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {generationLimitReached ? (
            <Alert severity="info">
              再生成の上限（月3回）に達したため、保存済みのコメントを表示しています。
            </Alert>
          ) : null}
          <Button
            disabled={generating || generationLimitReached}
            onClick={onGenerate}
            sx={{ alignSelf: "flex-start" }}
            variant="outlined"
          >
            {generating ? "生成しています…" : insight ? "コメントを再生成" : "コメントを生成"}
          </Button>
          <Typography color="text.secondary" variant="caption">
            金額と件数の集計値だけを外部のAIサービスに送ります。カテゴリ名・明細・店名は送りません。
            {insight && !generationLimitReached
              ? ` 再生成は残り${Math.max(0, 3 - (insight.generationCount ?? 1))}回までです（生成から24時間以内は保存済みを表示します）。`
              : !generationLimitReached
                ? " 生成は月ごとに3回までです。"
                : ""}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
