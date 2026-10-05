import { readFileSync } from "node:fs";

/**
 * Token usage extracted from an agent session transcript (JSONL).
 *
 * - Claude Code: assistant lines carry `message.id` + `message.usage`. One
 *   response is split across several lines that repeat the same usage, so
 *   responses are de-duplicated by `message.id`. `input_tokens` is already the
 *   uncached part; cache reads/writes are reported separately.
 * - Codex: `event_msg` lines with `payload.type === "token_count"` carry a
 *   cumulative `total_token_usage`; the last one is the session total.
 *   `input_tokens` includes `cached_input_tokens`, so uncached input is the
 *   difference. Model calls are counted as distinct cumulative totals.
 *
 * Reasoning tokens are part of output in both formats and are reported as a
 * subset, never added on top.
 */
const emptyUsage = () => ({
  calls: 0,
  inputUncached: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
});
const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

function parseLines(text) {
  const lines = [];
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") lines.push(parsed);
    } catch {
      // A partially written trailing line is expected while a session runs.
    }
  }
  return lines;
}

function claudeCodeUsage(lines) {
  const responses = new Map();
  for (const line of lines) {
    const message = line.message;
    // Sidechain (subagent) messages are recorded from their own transcript
    // (e.g. --usage-role reviewer); counting them here would double-count.
    if (line.isSidechain === true) continue;
    if (message?.role !== "assistant" || !message.usage) continue;
    const id = message.id ?? line.requestId ?? line.uuid;
    if (!id) continue;
    responses.set(id, { usage: message.usage, model: message.model });
  }
  if (responses.size === 0) return null;
  const usage = emptyUsage();
  const models = new Set();
  for (const { usage: item, model } of responses.values()) {
    usage.calls += 1;
    usage.inputUncached += count(item.input_tokens);
    usage.cacheRead += count(item.cache_read_input_tokens);
    usage.cacheWrite += count(item.cache_creation_input_tokens);
    usage.output += count(item.output_tokens);
    usage.reasoning += count(item.output_tokens_details?.thinking_tokens);
    if (model) models.add(model);
  }
  return { format: "claude-code", ...usage, models: [...models].sort() };
}

function codexUsage(lines) {
  let last = null;
  const totals = new Set();
  for (const line of lines) {
    const payload = line.payload;
    if (line.type !== "event_msg" || payload?.type !== "token_count") continue;
    const total = payload.info?.total_token_usage;
    if (!total) continue;
    last = total;
    totals.add(count(total.total_tokens));
  }
  if (!last) return null;
  const input = count(last.input_tokens);
  const cached = Math.min(count(last.cached_input_tokens), input);
  return {
    format: "codex",
    calls: totals.size,
    inputUncached: input - cached,
    cacheRead: cached,
    cacheWrite: count(last.cache_write_input_tokens),
    output: count(last.output_tokens),
    reasoning: count(last.reasoning_output_tokens),
    models: [],
  };
}

/** Parse transcript text; returns null when no usage record is recognized. */
export function transcriptUsage(text) {
  const lines = parseLines(text);
  return claudeCodeUsage(lines) ?? codexUsage(lines);
}

export function readTranscriptUsage(file) {
  return transcriptUsage(readFileSync(file, "utf8"));
}

export const USAGE_ROLES = ["implementer", "reviewer", "other"];
