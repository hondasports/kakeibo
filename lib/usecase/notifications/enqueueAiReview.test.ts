import { describe, expect, it, vi } from "vitest";
import type {
  LineNotificationEventRecord,
  LineNotificationJobRecord,
} from "../../domain/notifications/records";
import type {
  LineNotificationEventStore,
  LineNotificationJobStore,
} from "../../domain/notifications/store";
import type { TransactionalEmailJobRecord } from "../../domain/email/records";
import { enqueueAiReviewNotifications } from "./enqueueAiReview";
import type { AiReviewNotificationEnqueueDeps } from "./deps";

const ARGS = { batchId: "batch-1", userId: "user-1", pendingCount: 3 };

function makeDeps({
  email = "user@example.test",
  lineGlobal = true,
  linePersonal = true,
  links = [
    {
      id: "link-1",
      userId: "user-1",
      lineUserId: "line-user-1",
      status: "active",
      linkedAt: 111,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  existingLineJob = null,
  existingLineEvent = null,
  existingEmailJob = null,
  batch = {
    id: "batch-1",
    groupId: "group-1",
    createdByUserId: "user-1",
    totalCount: 1,
    processedCount: 1,
    status: "completed",
    createdAt: 0,
    updatedAt: 0,
  },
  group = { id: "group-1", status: "active" },
  membership = { id: "m-1" },
  deletionRequests = [],
  user,
}: {
  email?: string | null;
  lineGlobal?: boolean;
  linePersonal?: boolean;
  links?: unknown[];
  existingLineJob?: LineNotificationJobRecord | null;
  existingLineEvent?: LineNotificationEventRecord | null;
  existingEmailJob?: TransactionalEmailJobRecord | null;
  batch?: unknown;
  group?: unknown;
  membership?: unknown;
  deletionRequests?: { status: string }[];
  user?: unknown;
} = {}) {
  const emailJobs = { inserted: [] as Record<string, unknown>[] };
  const lineJobs = { inserted: [] as Record<string, unknown>[] };
  const lineEvents = { inserted: [] as Record<string, unknown>[] };
  const batchPatches = { applied: [] as { id: string; fields: Record<string, unknown> }[] };
  const emailScheduler = { scheduleProcessJob: vi.fn().mockResolvedValue(undefined) };
  const lineScheduler = {
    scheduleProcessJob: vi.fn().mockResolvedValue(undefined),
    scheduleLeaseRecovery: vi.fn().mockResolvedValue(undefined),
    scheduleCleanup: vi.fn().mockResolvedValue(undefined),
  };
  const resolvedUser =
    user !== undefined
      ? user
      : email === null
        ? {
            id: "doc-1",
            userId: "user-1",
            displayName: "u",
            notificationPreferences: { aiReviewRequiredLineEnabled: linePersonal },
            createdAt: 0,
            updatedAt: 0,
          }
        : {
            id: "doc-1",
            userId: "user-1",
            displayName: "u",
            email,
            notificationPreferences: { aiReviewRequiredLineEnabled: linePersonal },
            createdAt: 0,
            updatedAt: 0,
          };

  const deps = {
    batches: {
      getBatch: vi.fn().mockResolvedValue(batch),
      patchBatch: vi.fn(async (id: string, fields: Record<string, unknown>) => {
        batchPatches.applied.push({ id, fields });
      }),
    },
    groups: { get: vi.fn().mockResolvedValue(group) },
    memberships: { findByGroupAndUser: vi.fn().mockResolvedValue(membership) },
    users: { findByUserId: vi.fn().mockResolvedValue(resolvedUser) },
    accountDeletionRequests: { listByUser: vi.fn().mockResolvedValue(deletionRequests) },
    settings: {
      findByTypeAndChannel: vi.fn().mockResolvedValue({
        id: "s-1",
        type: "ai_review_required",
        channel: "line",
        enabled: lineGlobal,
        updatedByUserId: "admin",
        updatedAt: 0,
      }),
      listAll: vi.fn().mockResolvedValue([]),
    },
    links: { listActiveByUserId: vi.fn().mockResolvedValue(links) },
    emailJobs: {
      getJob: vi.fn().mockResolvedValue(null),
      insertJob: vi.fn(async (fields: Record<string, unknown>) => {
        emailJobs.inserted.push(fields);
        return "email-job-1";
      }),
      findJobByBusinessDedupeKey: vi.fn().mockResolvedValue(existingEmailJob),
      listDueJobs: vi.fn().mockResolvedValue([]),
      listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
      patchJob: vi.fn().mockResolvedValue(undefined),
      deleteJob: vi.fn().mockResolvedValue(undefined),
    },
    emailScheduler,
    lineJobs: {
      getJob: vi.fn().mockResolvedValue(null),
      findByBatchId: vi.fn().mockResolvedValue(existingLineJob),
      listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
      listJobsByStatusUpdatedBefore: vi.fn().mockResolvedValue([]),
      insert: vi.fn(async (fields: Record<string, unknown>) => {
        lineJobs.inserted.push(fields);
        return "line-job-1";
      }),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } satisfies LineNotificationJobStore,
    lineEvents: {
      findByDedupeKey: vi.fn().mockResolvedValue(existingLineEvent),
      listCreatedBefore: vi.fn().mockResolvedValue([]),
      insert: vi.fn(async (fields: Record<string, unknown>) => {
        lineEvents.inserted.push(fields);
        return "line-event-1";
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    } satisfies LineNotificationEventStore,
    lineScheduler,
    now: () => 5000,
  } as unknown as AiReviewNotificationEnqueueDeps;

  return { deps, emailJobs, lineJobs, lineEvents, batchPatches, emailScheduler, lineScheduler };
}

describe("enqueueAiReviewNotifications", () => {
  it("enqueues email with dedupe key and LINE job in the same pass", async () => {
    const { deps, emailJobs, lineJobs, lineEvents, batchPatches, emailScheduler, lineScheduler } =
      makeDeps();
    await enqueueAiReviewNotifications(deps, ARGS);

    expect(emailJobs.inserted).toHaveLength(1);
    expect(emailJobs.inserted[0]).toMatchObject({
      templateType: "ai_review_required",
      recipientEmail: "user@example.test",
      recipientUserId: "user-1",
      businessDedupeKey: "ai-review-required/batch-1",
    });
    expect(emailScheduler.scheduleProcessJob).toHaveBeenCalledWith(0, "email-job-1");

    expect(lineJobs.inserted).toHaveLength(1);
    expect(lineJobs.inserted[0]).toMatchObject({
      userId: "user-1",
      batchId: "batch-1",
      type: "ai_review_required",
      pendingCount: 3,
      linkId: "link-1",
      linkedAtSnapshot: 111,
      lineUserIdSnapshot: "line-user-1",
      status: "queued",
      attemptCount: 0,
    });
    expect(lineScheduler.scheduleProcessJob).toHaveBeenCalledWith(0, "line-job-1");
    expect(lineEvents.inserted).toHaveLength(1);
    expect(lineEvents.inserted[0]).toMatchObject({
      userId: "user-1",
      batchId: "batch-1",
      type: "ai_review_required",
      dedupeKey: "ai-review-required-line/batch-1",
      outcome: "queued",
    });
    expect(batchPatches.applied).toEqual([
      {
        id: "batch-1",
        fields: { aiReviewLineNotificationConsumedAt: 5000 },
      },
    ]);
  });

  it("still enqueues LINE when the user has no email address", async () => {
    const { deps, emailJobs, lineJobs } = makeDeps({ email: null });
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(emailJobs.inserted).toHaveLength(0);
    expect(lineJobs.inserted).toHaveLength(1);
  });

  it("still enqueues email when LINE is opted out", async () => {
    const { deps, emailJobs, lineJobs, lineEvents } = makeDeps({ linePersonal: false });
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(emailJobs.inserted).toHaveLength(1);
    expect(lineJobs.inserted).toHaveLength(0);
    expect(lineEvents.inserted[0]).toMatchObject({
      outcome: "skipped",
      reason: "notification_disabled",
    });
  });

  it("does not enqueue LINE when globally disabled or unlinked", async () => {
    for (const overrides of [{ lineGlobal: false }, { links: [] }] as const) {
      const { deps, emailJobs, lineJobs, lineEvents } = makeDeps(overrides);
      await enqueueAiReviewNotifications(deps, ARGS);
      expect(emailJobs.inserted).toHaveLength(1);
      expect(lineJobs.inserted).toHaveLength(0);
      expect(lineEvents.inserted).toHaveLength(1);
      expect(lineEvents.inserted[0]).toMatchObject({ outcome: "skipped" });
    }
  });

  it("dedupes LINE job per batch", async () => {
    const { deps, lineJobs } = makeDeps({
      existingLineJob: { id: "existing", status: "sent" } as LineNotificationJobRecord,
    });
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(lineJobs.inserted).toHaveLength(0);
  });

  it("does not backfill LINE after the batch event was already consumed", async () => {
    const { deps, lineJobs, lineEvents } = makeDeps({
      existingLineEvent: {
        id: "line-event-1",
        userId: "user-1",
        batchId: "batch-1",
        type: "ai_review_required",
        dedupeKey: "ai-review-required-line/batch-1",
        outcome: "skipped",
        reason: "user_unlinked",
        createdAt: 100,
        updatedAt: 100,
      },
    });
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(lineJobs.inserted).toHaveLength(0);
    expect(lineEvents.inserted).toHaveLength(0);
  });

  it("does not backfill LINE after consumed-event cleanup when the batch marker remains", async () => {
    const { deps, emailJobs, lineJobs, lineEvents, batchPatches } = makeDeps({
      batch: {
        id: "batch-1",
        groupId: "group-1",
        createdByUserId: "user-1",
        totalCount: 1,
        processedCount: 1,
        status: "completed",
        aiReviewLineNotificationConsumedAt: 100,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    await enqueueAiReviewNotifications(deps, ARGS);

    expect(emailJobs.inserted).toHaveLength(1);
    expect(lineJobs.inserted).toHaveLength(0);
    expect(lineEvents.inserted).toHaveLength(0);
    expect(batchPatches.applied).toHaveLength(0);
  });

  it("dedupes email via business dedupe key", async () => {
    const { deps, emailJobs } = makeDeps({
      existingEmailJob: { id: "existing-email" } as TransactionalEmailJobRecord,
    });
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(emailJobs.inserted).toHaveLength(0);
  });

  it("refuses when userId does not match the batch creator", async () => {
    const { deps, emailJobs, lineJobs } = makeDeps();
    await enqueueAiReviewNotifications(deps, { ...ARGS, userId: "someone-else" });
    expect(emailJobs.inserted).toHaveLength(0);
    expect(lineJobs.inserted).toHaveLength(0);
  });

  it.each([
    ["zero pending count", { pendingCount: 0 }],
    ["negative pending count", { pendingCount: -2 }],
  ])("enqueues nothing with %s", async (_label, args) => {
    const { deps, emailJobs, lineJobs } = makeDeps();
    await enqueueAiReviewNotifications(deps, { ...ARGS, ...args });
    expect(emailJobs.inserted).toHaveLength(0);
    expect(lineJobs.inserted).toHaveLength(0);
  });

  it.each([
    ["missing batch", { batch: null }],
    ["deleted group", { group: { id: "group-1", status: "deleted" } }],
    ["missing membership", { membership: null }],
    ["missing user", { user: null }],
    ["user deleting", { deletionRequests: [{ status: "requested" }] }],
  ])("enqueues nothing when %s", async (_label, overrides) => {
    const { deps, emailJobs, lineJobs } = makeDeps(overrides as never);
    await enqueueAiReviewNotifications(deps, ARGS);
    expect(emailJobs.inserted).toHaveLength(0);
    expect(lineJobs.inserted).toHaveLength(0);
  });
});
