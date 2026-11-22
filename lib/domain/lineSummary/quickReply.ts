/**
 * LINEサマリー返信に付けるクイックリプライ。
 * 家計金額は含めず、既存テキストコマンドとWeb URIだけをallowlistする。
 */

export const LINE_WEB_APP_PATH = "/weeks/current/input";
const LINE_QUICK_REPLY_WEB_LABEL = "Webで見る";
const LINE_QUICK_REPLY_MAX_ITEMS = 13;
const LINE_QUICK_REPLY_LABEL_MAX_LENGTH = 20;

export type LineReplyKind =
  | "unlinked"
  | "unavailable"
  | "no_group"
  | "unresolved"
  | "help"
  | "week_summary"
  | "week_expense"
  | "week_income"
  | "week_categories"
  | "week_trend"
  | "category_lookup"
  | "receipt_guide"
  | "expense_draft"
  | "expense_draft_limit";

export type LineQuickReplyAction =
  | { type: "message"; label: string; text: string }
  | { type: "uri"; label: string; uri: string };

function messageAction(label: string, text: string): LineQuickReplyAction {
  return { type: "message", label, text };
}

function webAction(webUrl: string): LineQuickReplyAction {
  return { type: "uri", label: LINE_QUICK_REPLY_WEB_LABEL, uri: webUrl };
}

export function buildLineQuickReplyActions(
  kind: LineReplyKind,
  webUrl: string,
): LineQuickReplyAction[] {
  if (kind === "unlinked" || kind === "unavailable") return [];

  const web = webAction(webUrl);
  const expense = messageAction("支出", "今週の支出");
  const income = messageAction("収入", "今週の収入");
  const categories = messageAction("カテゴリ別", "カテゴリ別");
  const trend = messageAction("週別推移", "週別推移");
  const summary = messageAction("今週の家計", "今週");
  const receipt = messageAction("レシートを送る", "レシートを送る");

  switch (kind) {
    case "week_summary":
      return [expense, income, categories, trend, receipt, web];
    case "week_expense":
      return [categories, trend, web];
    case "week_income":
      return [expense, categories, web];
    case "week_categories":
      return [expense, trend, web];
    case "week_trend":
      return [summary, expense, web];
    case "category_lookup":
      return [categories, expense, web];
    case "expense_draft":
      return [web];
    case "expense_draft_limit":
      return [web];
    case "receipt_guide":
      return [web];
    case "no_group":
    case "unresolved":
      return [web];
    case "help":
      return [summary, expense, income, categories, trend, receipt, web];
  }
}

function isAllowedLineQuickReplyAction(
  action: LineQuickReplyAction,
  allowedWebUrl: string,
): boolean {
  if (action.label.length === 0 || action.label.length > LINE_QUICK_REPLY_LABEL_MAX_LENGTH) {
    return false;
  }
  if (action.type === "message") {
    return action.text.length > 0 && action.text.length <= 300;
  }
  return action.uri === allowedWebUrl && allowedWebUrl.length > 0;
}

type LineQuickReplyPayloadItem =
  | {
      type: "action";
      action: { type: "message"; label: string; text: string };
    }
  | {
      type: "action";
      action: { type: "uri"; label: string; uri: string };
    };

export function toLineQuickReplyPayload(
  actions: LineQuickReplyAction[],
  allowedWebUrl: string,
): { items: LineQuickReplyPayloadItem[] } | undefined {
  const items: LineQuickReplyPayloadItem[] = actions
    .filter((action) => isAllowedLineQuickReplyAction(action, allowedWebUrl))
    .slice(0, LINE_QUICK_REPLY_MAX_ITEMS)
    .map((action) =>
      action.type === "message"
        ? {
            type: "action",
            action: { type: "message", label: action.label, text: action.text },
          }
        : {
            type: "action",
            action: { type: "uri", label: action.label, uri: action.uri },
          },
    );
  if (items.length === 0) return undefined;
  return { items };
}
