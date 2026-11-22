import type { MonthlyInsightInput } from "../../domain/monthlyInsights/monthlyInsight";
import { buildMonthlyInsightPrompt } from "../../domain/monthlyInsights/monthlyInsight";

export type MonthlyInsightGeneratorDeps = {
  readEnvironment: () => { appEnv: string | undefined; openAiApiKey: string | undefined };
  callOpenAI: (apiKey: string, prompt: string) => Promise<string>;
};

export function createMonthlyInsightGeneratorDeps(): MonthlyInsightGeneratorDeps {
  return {
    readEnvironment: () => ({
      appEnv: process.env.APP_ENV,
      openAiApiKey: process.env.OPENAI_API_KEY,
    }),
    callOpenAI: callOpenAIForInsight,
  };
}

export function buildInsightPrompt(input: MonthlyInsightInput): string {
  return buildMonthlyInsightPrompt(input);
}

async function callOpenAIForInsight(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: prompt,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI API がエラーを返しました（HTTP ${response.status}）`);
  }
  const data = (await response.json()) as {
    output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
  };
  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  if (!text) {
    throw new Error("OpenAI API の応答に本文がありませんでした");
  }
  return text.trim();
}
