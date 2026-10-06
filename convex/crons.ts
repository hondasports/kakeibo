import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup email records",
  { hours: 24 },
  internal.email.cleanup.cleanupOldEmailRecords,
  {},
);

crons.interval(
  "cleanup LINE webhook events",
  { hours: 24 },
  internal.lineWebhook.cleanup.cleanupOldEvents,
  {},
);

crons.interval(
  "cleanup completed account deletion requests",
  { hours: 24 },
  internal.accountDeletion.cleanupCompletedRequests,
  {},
);

crons.interval(
  "recover stale LINE notification jobs",
  { minutes: 1 },
  internal.notifications.internal.recoverStaleLineNotificationJobs,
  {},
);

crons.interval(
  "cleanup LINE notification jobs",
  { hours: 24 },
  internal.notifications.cleanup.cleanupOldLineNotificationJobs,
  {},
);

// E2E 残滓（memberless groups と orphan 運用レコード）の日次掃除。
// 内部で APP_ENV=development を確認するため、production では no-op。
crons.interval("purge e2e orphan data", { hours: 24 }, internal.e2ePurge.runOrphanPurge, {});

export default crons;
