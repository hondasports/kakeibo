/**
 * lineAccountLinks 読み取りポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { LineAccountLinkRecord } from "./records";

export interface LineAccountLinkReader {
  /** lineUserId に紐づく active リンクを最大 limit 件取得する（一意性判定用に limit=2 を想定）。 */
  listActiveByLineUserId(lineUserId: string, limit: number): Promise<LineAccountLinkRecord[]>;
  /** userId に紐づく active リンクを最大 limit 件取得する（一意性判定用に limit=2 を想定）。 */
  listActiveByUserId(userId: string, limit: number): Promise<LineAccountLinkRecord[]>;
}
