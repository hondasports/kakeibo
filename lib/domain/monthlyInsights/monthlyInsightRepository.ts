export type MonthlyInsightRecord = {
  groupId: string;
  month: string;
  commentText: string;
  /** 生成経路: ai=OpenAI生成・検証通過 / fallback=ルールベース定型 */
  source: "ai" | "fallback";
  generatedAt: number;
  generationCount?: number;
  /** 生成枠を予約中の期限（この時刻以降は予約失効とみなす）。未設定なら生成中でない */
  generatingUntil?: number;
};

export interface MonthlyInsightRepository {
  findByGroupAndMonth(groupId: string, month: string): Promise<MonthlyInsightRecord | null>;
  upsert(record: MonthlyInsightRecord): Promise<void>;
}
