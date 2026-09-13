import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";
import { clampExpirationLimit } from "../../domain/lineLink/rules";

export async function expireLineLinkRequests(
  requests: LineLinkRequestStore,
  args: { now: number; limit: number },
): Promise<{ expiredCount: number }> {
  const expired = await requests.takeExpired(args.now, clampExpirationLimit(args.limit));
  // state再利用を拒否できればよく、期限切れverifierを保存し続けない。
  for (const request of expired) await requests.deleteById(request.id);
  return { expiredCount: expired.length };
}

export async function expireLineLinkRequest(
  requests: LineLinkRequestStore,
  requestId: string,
  now = Date.now(),
): Promise<void> {
  const request = await requests.getById(requestId);
  if (!request || request.expiresAt > now) return;
  await requests.deleteById(request.id);
}
