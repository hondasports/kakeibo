/**
 * LINE Messaging API channel の default Rich Menu 仕様。
 * タップは既存の読み取り専用テキストコマンドを送る。設置正本は message action。
 * レシート送信案内と Web 導線はセルに置かず、クイックリプライ側で出す。
 * inbound postback はセル id / 送信テキストへ正規化して同じ dispatcher へ乗せる。
 */

export const LINE_RICH_MENU_SIZE = { width: 2500, height: 1686 } as const;
export const LINE_RICH_MENU_NAME = "suzumemo-readonly-summary-v1";
export const LINE_RICH_MENU_CHAT_BAR_TEXT = "家計簿";

type LineRichMenuBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LineRichMenuCell = {
  id: "week_summary" | "week_expense" | "week_income" | "week_categories" | "week_trend" | "help";
  label: string;
  messageText: string;
  bounds: LineRichMenuBounds;
};

const COLUMN_WIDTHS = [833, 834, 833] as const;
const ROW_HEIGHTS = [843, 843] as const;

function cellBounds(column: 0 | 1 | 2, row: 0 | 1): LineRichMenuBounds {
  return {
    x: COLUMN_WIDTHS.slice(0, column).reduce((sum, width) => sum + width, 0),
    y: ROW_HEIGHTS.slice(0, row).reduce((sum, height) => sum + height, 0),
    width: COLUMN_WIDTHS[column],
    height: ROW_HEIGHTS[row],
  };
}

export const lineRichMenuCells: readonly LineRichMenuCell[] = [
  { id: "week_summary", label: "今週の家計", messageText: "今週", bounds: cellBounds(0, 0) },
  { id: "week_expense", label: "支出", messageText: "今週の支出", bounds: cellBounds(1, 0) },
  { id: "week_income", label: "収入", messageText: "今週の収入", bounds: cellBounds(2, 0) },
  {
    id: "week_categories",
    label: "カテゴリ別",
    messageText: "カテゴリ別",
    bounds: cellBounds(0, 1),
  },
  { id: "week_trend", label: "週別推移", messageText: "週別推移", bounds: cellBounds(1, 1) },
  { id: "help", label: "使い方", messageText: "使い方", bounds: cellBounds(2, 1) },
];

export type LineRichMenuObject = {
  size: typeof LINE_RICH_MENU_SIZE;
  selected: true;
  name: typeof LINE_RICH_MENU_NAME;
  chatBarText: typeof LINE_RICH_MENU_CHAT_BAR_TEXT;
  areas: Array<{
    bounds: LineRichMenuBounds;
    action: { type: "message"; label: string; text: string };
  }>;
};

export function buildLineRichMenuObject(): LineRichMenuObject {
  return {
    size: LINE_RICH_MENU_SIZE,
    selected: true,
    name: LINE_RICH_MENU_NAME,
    chatBarText: LINE_RICH_MENU_CHAT_BAR_TEXT,
    areas: lineRichMenuCells.map((cell) => ({
      bounds: cell.bounds,
      action: {
        type: "message",
        label: cell.label,
        text: cell.messageText,
      },
    })),
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const LINE_RICH_MENU_IMAGE_MAX_BYTES = 1_000_000;

function readPngUint32(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new Error("LINE rich menu image is invalid");
  }
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

export function validateLineRichMenuImage(bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > LINE_RICH_MENU_IMAGE_MAX_BYTES) {
    throw new Error("LINE rich menu image is invalid");
  }
  if (bytes.length < 24) {
    throw new Error("LINE rich menu image is invalid");
  }
  for (const [index, expected] of PNG_SIGNATURE.entries()) {
    if (bytes[index] !== expected) {
      throw new Error("LINE rich menu image is invalid");
    }
  }
  if (readPngUint32(bytes, 16) !== LINE_RICH_MENU_SIZE.width) {
    throw new Error("LINE rich menu image is invalid");
  }
  if (readPngUint32(bytes, 20) !== LINE_RICH_MENU_SIZE.height) {
    throw new Error("LINE rich menu image is invalid");
  }
}
