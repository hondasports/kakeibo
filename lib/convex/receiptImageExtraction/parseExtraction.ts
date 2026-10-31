import { ConvexError } from "convex/values";
import {
  parseExtractionPayload,
  type ParseExtractionPayloadResult,
} from "../../../lib/domain/receipt/extraction";
import type { ExtractedFields, OpenAIResponsesApiResponse } from "./types";

type ExtractResponsePayloadResult =
  | { success: true; payload: unknown }
  | { success: false; error: string };

/** OpenAI Responses API の envelope から抽出 payload を取り出す */
function extractResponsePayload(data: OpenAIResponsesApiResponse): ExtractResponsePayloadResult {
  try {
    const message = data.output?.find((o) => o.type === "message");
    const textContent = message?.content?.find((c) => c.type === "output_text");
    if (!textContent?.text) {
      throw new Error("OpenAI からのレスポンスに期待するテキストコンテンツが含まれていません");
    }
    try {
      return { success: true, payload: JSON.parse(textContent.text) };
    } catch {
      throw new Error("OpenAI からのレスポンスを JSON としてパースできませんでした");
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** OpenAI Responses API のレスポンスから抽出結果を取り出す */
export function parseOpenAIResponse(data: OpenAIResponsesApiResponse): ExtractedFields {
  const envelope = extractResponsePayload(data);
  if (!envelope.success) {
    throw new ConvexError(envelope.error);
  }
  const result = parseExtractionPayload(envelope.payload);
  if (!result.success) {
    throw new ConvexError(result.error);
  }
  return result.extracted;
}

export type { ParseExtractionPayloadResult };
