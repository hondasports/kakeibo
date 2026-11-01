import { DEFAULT_MAX_RETRY_ATTEMPTS } from "../common/retry";

/** グループ削除パイプラインの定数（ドメインポリシー）。 */
export const MAX_ATTEMPTS = DEFAULT_MAX_RETRY_ATTEMPTS;
export const BATCH_SIZE = 25;
export const FAILURE_NOTIFICATION_MAX_DELAY_MS = 6 * 60 * 60_000;
