import { describe, expect, it, vi } from "vitest";
import type { LineNotificationJobRecord } from "../../domain/notifications/records";
import {
  authorizeLineNotificationSend,
  claimLineNotificationJob,
  completeLineNotificationJob,
  recoverLineNotificationLease,
  recoverStaleLineNotificationJobs,
} from "./lineJobLifecycle";
import type { LineNotificationClaimDeps } from "./deps";

function makeJob(overrides: Partial<LineNotificationJobRecord> = {}): LineNotificationJobRecord {
  return {
    id: "job-1",
    userId: "user-1",
    batchId: "batch-1",
    type: "ai_review_required",
    pendingCount: 2,
    linkId: "link-1",
    linkedAtSnapshot: 111,
    lineUserIdSnapshot: "line-user-1",
    text: "text",
    status: "queued",
    attemptCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeDeps({
  job,
  lineSettingEnabled = true,
  linePreference = true,
  user = {
    id: "doc-1",
    userId: "user-1",
    notificationPreferences: { aiReviewRequiredLineEnabled: linePreference },
  },
  links = [
    { id: "link-1", userId: "user-1", lineUserId: "line-user-1", status: "active", linkedAt: 111 },
  ],
  batch = { id: "batch-1", groupId: "group-1", createdByUserId: "user-1" },
  group = { id: "group-1", status: "active" },
  membership = { id: "m-1" },
  deletionRequests = [],
}: {
  job: LineNotificationJobRecord | null;
  lineSettingEnabled?: boolean;
  linePreference?: boolean;
  user?: unknown;
  links?: unknown[];
  batch?: unknown;
  group?: unknown;
  membership?: unknown;
  deletionRequests?: { status: string }[];
}): {
  deps: LineNotificationClaimDeps;
  patches: { jobId: string; fields: Record<string, unknown> }[];
  scheduler: {
    scheduleProcessJob: ReturnType<typeof vi.fn>;
    scheduleLeaseRecovery: ReturnType<typeof vi.fn>;
    scheduleCleanup: ReturnType<typeof vi.fn>;
  };
} {
  const patches: { jobId: string; fields: Record<string, unknown> }[] = [];
  const scheduler = {
    scheduleProcessJob: vi.fn().mockResolvedValue(undefined),
    scheduleLeaseRecovery: vi.fn().mockResolvedValue(undefined),
    scheduleCleanup: vi.fn().mockResolvedValue(undefined),
  };
  const deps = {
    jobs: {
      getJob: vi.fn().mockResolvedValue(job),
      findByBatchId: vi.fn().mockResolvedValue(null),
      listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
      listJobsByStatusUpdatedBefore: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockResolvedValue("new-id"),
      patch: vi.fn(async (jobId: string, fields: Record<string, unknown>) => {
        patches.push({ jobId, fields });
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    settings: {
      findByTypeAndChannel: vi.fn().mockResolvedValue(
        lineSettingEnabled === undefined
          ? null
          : {
              id: "s-1",
              type: "ai_review_required",
              channel: "line",
              enabled: lineSettingEnabled,
              updatedByUserId: "admin",
              updatedAt: 0,
            },
      ),
      listAll: vi.fn().mockResolvedValue([]),
    },
    users: { findByUserId: vi.fn().mockResolvedValue(user) },
    links: {
      listActiveByUserId: vi.fn().mockResolvedValue(links),
      findLatestActiveByUserId: vi.fn().mockResolvedValue(links[0] ?? null),
    },
    batches: { getBatch: vi.fn().mockResolvedValue(batch) },
    groups: { get: vi.fn().mockResolvedValue(group) },
    memberships: { findByGroupAndUser: vi.fn().mockResolvedValue(membership) },
    accountDeletionRequests: { listByUser: vi.fn().mockResolvedValue(deletionRequests) },
    scheduler,
  } as unknown as LineNotificationClaimDeps;
  return { deps, patches, scheduler };
}

const CLAIM_ARGS = {
  jobId: "job-1",
  retryKeyCandidate: "550e8400-e29b-41d4-a716-446655440000",
  leaseMs: 30_000,
  now: 10_000,
};

describe("claimLineNotificationJob", () => {
  it("claims a due queued job: installs retryKey, lease, firstAttemptAt and schedules recovery", async () => {
    const { deps, patches, scheduler } = makeDeps({ job: makeJob() });
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);

    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(result.job.retryKey).toBe(CLAIM_ARGS.retryKeyCandidate);
      expect(result.job.attemptCount).toBe(1);
      expect(result.job.leaseUntil).toBe(10_000 + 30_000);
    }
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({
      status: "processing",
      attemptCount: 1,
      retryKey: CLAIM_ARGS.retryKeyCandidate,
      firstAttemptAt: 10_000,
      leaseUntil: 40_000,
    });
    expect(scheduler.scheduleLeaseRecovery).toHaveBeenCalledWith("job-1", 1, 40_000);
  });

  it("reuses the persisted retryKey on retries instead of the candidate", async () => {
    const persisted = "aaaaaaaa-0000-4000-8000-000000000000";
    const { deps, patches } = makeDeps({
      job: makeJob({
        status: "retrying",
        nextRetryAt: 5_000,
        attemptCount: 2,
        retryKey: persisted,
        firstAttemptAt: 1_000,
      }),
    });
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);

    expect(result.claimed).toBe(true);
    expect(patches[0].fields).toMatchObject({ retryKey: persisted, attemptCount: 3 });
    if (result.claimed) {
      expect(result.job.retryKey).toBe(persisted);
      expect(result.job.firstAttemptAt).toBe(1_000);
    }
  });

  it("does not claim terminal or not-yet-due jobs", async () => {
    for (const job of [
      makeJob({ status: "sent" }),
      makeJob({ status: "retrying", nextRetryAt: 99_999 }),
      makeJob({ status: "processing", leaseUntil: 99_999 }),
    ]) {
      const { deps, patches } = makeDeps({ job });
      const result = await claimLineNotificationJob(deps, CLAIM_ARGS);
      expect(result.claimed).toBe(false);
      expect(patches).toHaveLength(0);
    }
  });

  it.each([
    ["globally disabled", { lineSettingEnabled: false }, "notification_disabled"],
    [
      "user opted out",
      {
        user: {
          id: "d",
          userId: "user-1",
          notificationPreferences: { aiReviewRequiredLineEnabled: false },
        },
      },
      "notification_disabled",
    ],
    ["user missing", { user: null }, "user_deleted"],
    ["user deleting", { deletionRequests: [{ status: "requested" }] }, "user_deleting"],
    ["no active link", { links: [] }, "user_unlinked"],
    [
      "relinked (different link id)",
      {
        links: [
          {
            id: "link-2",
            userId: "user-1",
            lineUserId: "line-user-1",
            status: "active",
            linkedAt: 222,
          },
        ],
      },
      "link_changed",
    ],
    ["batch missing", { batch: null }, "batch_deleted"],
    [
      "batch creator changed",
      { batch: { id: "batch-1", groupId: "group-1", createdByUserId: "other" } },
      "batch_deleted",
    ],
    ["group deleted", { group: { id: "group-1", status: "deleted" } }, "group_deleted"],
    ["membership missing", { membership: null }, "membership_missing"],
  ])("suppresses with %s without claiming", async (_label, overrides, errorCode) => {
    const { deps, patches } = makeDeps({
      job: makeJob(),
      ...(overrides as Record<string, unknown>),
    } as Parameters<typeof makeDeps>[0]);
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);

    expect(result.claimed).toBe(false);
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({ status: "suppressed", errorCode });
  });

  it("fails terminally instead of claiming when the attempt budget is exhausted", async () => {
    const { deps, patches, scheduler } = makeDeps({
      job: makeJob({ status: "retrying", nextRetryAt: 5_000, attemptCount: 6 }),
    });
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);
    expect(result.claimed).toBe(false);
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({
      status: "failed",
      errorCode: "max_attempts_reached",
    });
    expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
    expect(scheduler.scheduleLeaseRecovery).not.toHaveBeenCalled();
  });

  it("fails terminally instead of claiming when firstAttemptAt + 24h has passed", async () => {
    const firstAttemptAt = CLAIM_ARGS.now - 24 * 60 * 60 * 1000;
    const { deps, patches, scheduler } = makeDeps({
      job: makeJob({
        status: "retrying",
        nextRetryAt: 5_000,
        attemptCount: 2,
        firstAttemptAt,
        retryKey: CLAIM_ARGS.retryKeyCandidate,
      }),
    });
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);
    expect(result.claimed).toBe(false);
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({
      status: "failed",
      errorCode: "retry_key_expired",
    });
    expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
    expect(scheduler.scheduleLeaseRecovery).not.toHaveBeenCalled();
  });

  it("suppresses when multiple active links exist (ambiguous recipient)", async () => {
    const link = {
      id: "link-1",
      userId: "user-1",
      lineUserId: "line-user-1",
      status: "active",
      linkedAt: 111,
    };
    const { deps, patches } = makeDeps({ job: makeJob(), links: [link, link] });
    const result = await claimLineNotificationJob(deps, CLAIM_ARGS);
    expect(result.claimed).toBe(false);
    expect(patches[0].fields).toMatchObject({ status: "suppressed", errorCode: "link_changed" });
  });
});

describe("authorizeLineNotificationSend", () => {
  const AUTHORIZE_ARGS = {
    jobId: "job-1",
    attemptCount: 1,
    retryKey: CLAIM_ARGS.retryKeyCandidate,
    leaseMs: 30_000,
    now: 10_000,
  };

  it("extends the lease after re-checking the processing/attempt/retry-key fence", async () => {
    const job = makeJob({
      status: "processing",
      attemptCount: 1,
      retryKey: CLAIM_ARGS.retryKeyCandidate,
      leaseUntil: 20_000,
      firstAttemptAt: 1_000,
    });
    const { deps, patches } = makeDeps({ job });
    const result = await authorizeLineNotificationSend(deps, AUTHORIZE_ARGS);

    expect(result.claimed).toBe(true);
    if (result.claimed) expect(result.job.leaseUntil).toBe(40_000);
    expect(patches[0].fields).toMatchObject({ leaseUntil: 40_000, updatedAt: 10_000 });
  });

  it.each([
    ["stale attempt", { attemptCount: 2 }],
    ["stale retry key", { retryKey: "aaaaaaaa-0000-4000-8000-000000000000" }],
    ["expired lease", { leaseUntil: 9_999 }],
    ["retrying status", { status: "retrying" as const }],
  ])("rejects %s without another write", async (_label, overrides) => {
    const job = makeJob({
      status: "processing",
      attemptCount: 1,
      retryKey: CLAIM_ARGS.retryKeyCandidate,
      leaseUntil: 20_000,
      ...overrides,
    });
    const { deps, patches } = makeDeps({ job });
    const result = await authorizeLineNotificationSend(deps, AUTHORIZE_ARGS);
    expect(result.claimed).toBe(false);
    expect(patches).toHaveLength(0);
  });

  it("suppresses instead of authorizing when the user opted out after claim", async () => {
    const job = makeJob({
      status: "processing",
      attemptCount: 1,
      retryKey: CLAIM_ARGS.retryKeyCandidate,
      leaseUntil: 20_000,
      firstAttemptAt: 1_000,
    });
    const { deps, patches } = makeDeps({ job, linePreference: false });
    const result = await authorizeLineNotificationSend(deps, AUTHORIZE_ARGS);

    expect(result.claimed).toBe(false);
    expect(patches.at(-1)?.fields).toMatchObject({
      status: "suppressed",
      errorCode: "notification_disabled",
    });
  });
});

describe("completeLineNotificationJob", () => {
  function makeCompletionDeps(job: LineNotificationJobRecord | null) {
    const patches: { jobId: string; fields: Record<string, unknown> }[] = [];
    const scheduler = { scheduleProcessJob: vi.fn().mockResolvedValue(undefined) };
    return {
      deps: {
        jobs: {
          getJob: vi.fn().mockResolvedValue(job),
          findByBatchId: vi.fn().mockResolvedValue(null),
          listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
          listJobsByStatusUpdatedBefore: vi.fn().mockResolvedValue([]),
          insert: vi.fn().mockResolvedValue("x"),
          patch: vi.fn(async (jobId: string, fields: Record<string, unknown>) => {
            patches.push({ jobId, fields });
          }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
        scheduler,
        now: () => 20_000,
      },
      patches,
      scheduler,
    };
  }

  const processingJob = makeJob({ status: "processing", attemptCount: 1, leaseUntil: 40_000 });

  it("marks sent with providerRequestId and does not schedule", async () => {
    const { deps, patches, scheduler } = makeCompletionDeps(processingJob);
    await completeLineNotificationJob(deps, {
      jobId: "job-1",
      attemptCount: 1,
      completion: { outcome: "sent", providerRequestId: "req-1" },
    });
    expect(patches[0].fields).toMatchObject({
      status: "sent",
      providerRequestId: "req-1",
      updatedAt: 20_000,
    });
    expect(patches[0].fields.leaseUntil).toBeUndefined();
    expect("leaseUntil" in patches[0].fields).toBe(true);
    expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
  });

  it("marks retrying and schedules the retry inside the completion", async () => {
    const { deps, patches, scheduler } = makeCompletionDeps(processingJob);
    await completeLineNotificationJob(deps, {
      jobId: "job-1",
      attemptCount: 1,
      completion: { outcome: "retrying", nextRetryAt: 70_000, errorCode: "provider_server_error" },
    });
    expect(patches[0].fields).toMatchObject({
      status: "retrying",
      nextRetryAt: 70_000,
      errorCode: "provider_server_error",
    });
    expect(scheduler.scheduleProcessJob).toHaveBeenCalledWith(50_000, "job-1");
  });

  it("clamps a past-due nextRetryAt to a zero delay", async () => {
    const { deps, scheduler } = makeCompletionDeps(processingJob);
    await completeLineNotificationJob(deps, {
      jobId: "job-1",
      attemptCount: 1,
      completion: { outcome: "retrying", nextRetryAt: 10_000, errorCode: "x" },
    });
    expect(scheduler.scheduleProcessJob).toHaveBeenCalledWith(0, "job-1");
  });

  it("propagates scheduling failure so the mutation rolls back", async () => {
    const { deps, scheduler } = makeCompletionDeps(processingJob);
    scheduler.scheduleProcessJob.mockRejectedValue(new Error("scheduler down"));
    await expect(
      completeLineNotificationJob(deps, {
        jobId: "job-1",
        attemptCount: 1,
        completion: { outcome: "retrying", nextRetryAt: 70_000 },
      }),
    ).rejects.toThrow("scheduler down");
  });

  it("marks failed/suppressed terminally without scheduling", async () => {
    for (const outcome of ["failed", "suppressed"] as const) {
      const { deps, patches, scheduler } = makeCompletionDeps(processingJob);
      await completeLineNotificationJob(deps, {
        jobId: "job-1",
        attemptCount: 1,
        completion: { outcome, errorCode: "x" },
      });
      expect(patches[0].fields).toMatchObject({ status: outcome });
      expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
    }
  });

  it("ignores stale completions fenced by status and attemptCount, without scheduling", async () => {
    for (const job of [
      makeJob({ status: "retrying", attemptCount: 1 }),
      makeJob({ status: "processing", attemptCount: 2 }),
      makeJob({ status: "sent", attemptCount: 1 }),
    ]) {
      const { deps, patches, scheduler } = makeCompletionDeps(job);
      await completeLineNotificationJob(deps, {
        jobId: job.id,
        attemptCount: 1,
        completion: { outcome: "retrying", nextRetryAt: 70_000 },
      });
      expect(patches).toHaveLength(0);
      expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
    }
  });
});

describe("recoverLineNotificationLease", () => {
  function makeRecoverDeps(job: LineNotificationJobRecord | null) {
    const patches: { jobId: string; fields: Record<string, unknown> }[] = [];
    const scheduler = { scheduleProcessJob: vi.fn().mockResolvedValue(undefined) };
    return {
      deps: {
        jobs: {
          getJob: vi.fn().mockResolvedValue(job),
          findByBatchId: vi.fn().mockResolvedValue(null),
          listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
          listJobsByStatusUpdatedBefore: vi.fn().mockResolvedValue([]),
          insert: vi.fn().mockResolvedValue("x"),
          patch: vi.fn(async (jobId: string, fields: Record<string, unknown>) => {
            patches.push({ jobId, fields });
          }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
        scheduler: {
          scheduleProcessJob: scheduler.scheduleProcessJob,
          scheduleLeaseRecovery: vi.fn().mockResolvedValue(undefined),
          scheduleCleanup: vi.fn().mockResolvedValue(undefined),
        },
      },
      patches,
      scheduler,
    };
  }

  it("returns expired-lease processing job to retrying and reschedules", async () => {
    const { deps, patches, scheduler } = makeRecoverDeps(
      makeJob({ status: "processing", attemptCount: 1, leaseUntil: 40_000 }),
    );
    await recoverLineNotificationLease(deps, { jobId: "job-1", attemptCount: 1 }, 41_000);
    expect(patches[0].fields).toMatchObject({ status: "retrying", nextRetryAt: 41_000 });
    expect(scheduler.scheduleProcessJob).toHaveBeenCalledWith(0, "job-1");
  });

  it("does nothing while lease is still valid or attempt mismatched", async () => {
    for (const [job, attemptCount] of [
      [makeJob({ status: "processing", attemptCount: 1, leaseUntil: 40_000 }), 1],
      [makeJob({ status: "processing", attemptCount: 2, leaseUntil: 10 }), 1],
      [makeJob({ status: "sent", attemptCount: 1, leaseUntil: 10 }), 1],
    ] as const) {
      const { deps, patches, scheduler } = makeRecoverDeps(job);
      await recoverLineNotificationLease(deps, { jobId: "job-1", attemptCount }, 30_000);
      expect(patches).toHaveLength(0);
      expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
    }
  });

  it("fails terminally instead of rescheduling when the crashed attempt was the last", async () => {
    const { deps, patches, scheduler } = makeRecoverDeps(
      makeJob({ status: "processing", attemptCount: 6, leaseUntil: 40_000 }),
    );
    await recoverLineNotificationLease(deps, { jobId: "job-1", attemptCount: 6 }, 41_000);
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({
      status: "failed",
      errorCode: "max_attempts_reached",
    });
    expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
  });

  it("fails terminally instead of rescheduling when the retry key TTL passed during the crash", async () => {
    const firstAttemptAt = 1_000;
    const { deps, patches, scheduler } = makeRecoverDeps(
      makeJob({
        status: "processing",
        attemptCount: 2,
        leaseUntil: firstAttemptAt + 24 * 60 * 60 * 1000 + 10_000,
        firstAttemptAt,
      }),
    );
    const now = firstAttemptAt + 24 * 60 * 60 * 1000 + 20_000;
    await recoverLineNotificationLease(deps, { jobId: "job-1", attemptCount: 2 }, now);
    expect(patches).toHaveLength(1);
    expect(patches[0].fields).toMatchObject({
      status: "failed",
      errorCode: "retry_key_expired",
    });
    expect(scheduler.scheduleProcessJob).not.toHaveBeenCalled();
  });
});

describe("recoverStaleLineNotificationJobs", () => {
  it("reschedules stale queued jobs, due retries and expired processing leases", async () => {
    const queued = makeJob({ id: "queued-1", status: "queued", updatedAt: 0 });
    const retrying = makeJob({
      id: "retrying-1",
      status: "retrying",
      attemptCount: 1,
      nextRetryAt: 50_000,
      updatedAt: 0,
    });
    const futureRetry = makeJob({
      id: "retrying-future",
      status: "retrying",
      attemptCount: 1,
      nextRetryAt: 200_000,
      updatedAt: 0,
    });
    const processing = makeJob({
      id: "processing-1",
      status: "processing",
      attemptCount: 1,
      leaseUntil: 60_000,
      updatedAt: 0,
    });
    const patches: { jobId: string; fields: Record<string, unknown> }[] = [];
    const scheduler = { scheduleProcessJob: vi.fn().mockResolvedValue(undefined) };
    const deps = {
      jobs: {
        getJob: vi.fn().mockResolvedValue(processing),
        findByBatchId: vi.fn().mockResolvedValue(null),
        listTerminalJobsUpdatedBefore: vi.fn().mockResolvedValue([]),
        listJobsByStatusUpdatedBefore: vi.fn(async (status: string) => {
          if (status === "queued") return [queued];
          if (status === "retrying") return [retrying, futureRetry];
          if (status === "processing") return [processing];
          return [];
        }),
        insert: vi.fn().mockResolvedValue("x"),
        patch: vi.fn(async (jobId: string, fields: Record<string, unknown>) => {
          patches.push({ jobId, fields });
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      scheduler,
      now: () => 100_000,
    };

    await recoverStaleLineNotificationJobs(deps);

    expect(scheduler.scheduleProcessJob).toHaveBeenCalledTimes(3);
    expect(scheduler.scheduleProcessJob).toHaveBeenNthCalledWith(1, 0, "queued-1");
    expect(scheduler.scheduleProcessJob).toHaveBeenNthCalledWith(2, 0, "retrying-1");
    expect(scheduler.scheduleProcessJob).toHaveBeenNthCalledWith(3, 0, "processing-1");
    expect(patches.map((patch) => patch.jobId)).toEqual(["queued-1", "retrying-1", "processing-1"]);
    expect(patches[2].fields).toMatchObject({ status: "retrying", nextRetryAt: 100_000 });
  });
});
