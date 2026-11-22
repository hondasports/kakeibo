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
          <Button
            disabled={generating}
            onClick={onGenerate}
            sx={{ alignSelf: "flex-start" }}
            variant="outlined"
          >
            {generating ? "生成しています…" : insight ? "コメントを再生成" : "コメントを生成"}
          </Button>
          <Typography color="text.secondary" variant="caption">
            カテゴリ別の集計値のみを外部サービスに送信してAIが生成します。明細・店名・個人情報は送信しません。
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
