export type MonthlyInsightRecord = {
  groupId: string;
  month: string;
  commentText: string;
  /** 生成経路: ai=OpenAI生成・検証通過 / fallback=ルールベース定型 */
  source: "ai" | "fallback";
  generatedAt: number;
};

export interface MonthlyInsightRepository {
  findByGroupAndMonth(groupId: string, month: string): Promise<MonthlyInsightRecord | null>;
  upsert(record: MonthlyInsightRecord): Promise<void>;
}
