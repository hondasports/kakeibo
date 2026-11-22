import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { INSIGHT_MAX_REGENERATIONS } from "../../../../lib/domain/monthlyInsights/monthlyInsight";

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

  // 再生成の回数 = 累計の生成回数 - 初回の1回（上限は再生成のみに掛かる）
  const regenerationsUsed = insight === null ? 0 : Math.max(0, (insight.generationCount ?? 1) - 1);
  const generationLimitReached = regenerationsUsed >= INSIGHT_MAX_REGENERATIONS;
  const generationInProgress =
    insight?.generatingUntil !== undefined && insight.generatingUntil > Date.now();

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography component="h2" variant="h6">
            AI月次インサイト
          </Typography>
          {insight && insight.commentText !== "" ? (
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
              再生成の上限（月{INSIGHT_MAX_REGENERATIONS}
              回）に達したため、保存済みのコメントを表示しています。
            </Alert>
          ) : null}
          <Button
            disabled={generating || generationLimitReached || generationInProgress}
            onClick={onGenerate}
            sx={{ alignSelf: "flex-start" }}
            variant="outlined"
          >
            {generating || generationInProgress
              ? "生成しています…"
              : insight
                ? "コメントを再生成"
                : "コメントを生成"}
          </Button>
          <Typography color="text.secondary" variant="caption">
            金額と件数の集計値だけを外部のAIサービスに送ります。カテゴリ名・明細・店名は送りません。
            {insight && !generationLimitReached
              ? ` 再生成は残り${Math.max(0, INSIGHT_MAX_REGENERATIONS - regenerationsUsed)}回までです（生成から24時間以内は保存済みを表示します）。`
              : !generationLimitReached
                ? ` 再生成は月ごとに${INSIGHT_MAX_REGENERATIONS}回までです。`
                : ""}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
