import { describe, expect, it } from "vitest";
import { transcriptUsage } from "./agent-usage.mjs";

const jsonl = (...lines) => lines.map((line) => JSON.stringify(line)).join("\n");

describe("transcript token usage", () => {
  it("de-duplicates Claude Code responses split across lines and keeps cache tiers apart", () => {
    const response = (id, usage, model = "claude-test") => ({
      message: { id, role: "assistant", model, usage },
    });
    const usage = transcriptUsage(
      jsonl(
        { type: "user", message: { role: "user", content: "hi" } },
        response("msg_1", {
          input_tokens: 2,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 1000,
          output_tokens: 40,
          output_tokens_details: { thinking_tokens: 10 },
        }),
        response("msg_1", {
          input_tokens: 2,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 1000,
          output_tokens: 40,
          output_tokens_details: { thinking_tokens: 10 },
        }),
        response("msg_2", { input_tokens: 3, cache_read_input_tokens: 500, output_tokens: 5 }),
      ) + '\n{"partial',
    );
    expect(usage).toEqual({
      format: "claude-code",
      calls: 2,
      inputUncached: 5,
      cacheRead: 1500,
      cacheWrite: 100,
      output: 45,
      reasoning: 10,
      models: ["claude-test"],
    });
  });
  it("uses the last cumulative Codex total and separates cached input", () => {
    const tokenCount = (total) => ({
      type: "event_msg",
      payload: { type: "token_count", info: { total_token_usage: total } },
    });
    const first = {
      input_tokens: 100,
      cached_input_tokens: 40,
      output_tokens: 10,
      reasoning_output_tokens: 4,
      total_tokens: 110,
    };
    const last = {
      input_tokens: 300,
      cached_input_tokens: 200,
      cache_write_input_tokens: 0,
      output_tokens: 30,
      reasoning_output_tokens: 12,
      total_tokens: 330,
    };
    const usage = transcriptUsage(
      jsonl(tokenCount(first), tokenCount(first), tokenCount(last), { type: "response_item" }),
    );
    expect(usage).toEqual({
      format: "codex",
      calls: 2,
      inputUncached: 100,
      cacheRead: 200,
      cacheWrite: 0,
      output: 30,
      reasoning: 12,
      models: [],
    });
  });
  it("returns null when no usage record is recognized", () => {
    expect(transcriptUsage("")).toBeNull();
    expect(transcriptUsage(jsonl({ type: "user" }, { message: { role: "assistant" } }))).toBeNull();
  });
});
