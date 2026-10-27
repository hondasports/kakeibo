/**
 * E2E が期待する「今週」「今月」をアプリと同じ規則で計算する。
 *
 * - 週: サマリー・入力・履歴ナビの週はブラウザのローカル日付を週開始曜日で
 *   正規化したもの（src/features/week/lib/weekNavigation.ts の
 *   getCurrentWeekStartDate）。JST ではなくローカル日付を使うのは、
 *   アプリ側の週計算がブラウザのローカル時刻ベースだからで、
 *   実行環境の TZ が何でもブラウザと同じ週を指せる。
 *   E2E ユーザーは週開始曜日を変更しない前提（DEFAULT_WEEK_START_DAY=月曜）。
 * - 月: 月次サマリー・履歴メニューの「今月」は JST の暦月
 *   （lib/domain/common/month.ts の getCurrentMonth をそのまま使う）。
 *
 * page.clock.setFixedTime には頼らない。ブラウザ時刻だけを固定しても、
 * Convex 側で週次セッションを決める時刻（UTC）や JST 基準の月計算は
 * 変わらず、固定した瞬間とアプリの「今」の対応が実行環境依存になるため。
 */
import { addDays } from "../../lib/domain/common/date";
import { calculateWeekStartDate, DEFAULT_WEEK_START_DAY } from "../../lib/domain/week/weekDates";
import { formatLocalDate } from "../../lib/domain/weekSessions/rules";

export function getCurrentWeekStartDate(now: Date | number = new Date()): string {
  const timestamp = typeof now === "number" ? now : now.getTime();
  return calculateWeekStartDate(formatLocalDate(timestamp), DEFAULT_WEEK_START_DAY);
}

export { getCurrentMonth } from "../../lib/domain/common/month";

export function addWeeks(weekStartDate: string, weeks: number): string {
  return addDays(weekStartDate, weeks * 7);
}
