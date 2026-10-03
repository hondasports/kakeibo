import type { TransactionalEmailType } from "../../email/model";
import type { NotificationChannel } from "./model";
import type {
  LineNotificationEventRecord,
  LineNotificationJobRecord,
  LineNotificationJobStatus,
  NewLineNotificationEventFields,
  NewLineNotificationJobFields,
  NotificationSettingRecord,
  TerminalLineNotificationJobStatus,
} from "./records";

export interface NotificationSettingReader {
  findByTypeAndChannel(
    type: TransactionalEmailType,
    channel: NotificationChannel,
  ): Promise<NotificationSettingRecord | null>;
  listAll(limit?: number): Promise<NotificationSettingRecord[]>;
}

export interface NotificationSettingStore extends NotificationSettingReader {
  insert(fields: Omit<NotificationSettingRecord, "id">): Promise<string>;
  patch(
    id: string,
    fields: Pick<NotificationSettingRecord, "enabled" | "updatedByUserId" | "updatedAt">,
  ): Promise<void>;
}

export interface LineNotificationJobReader {
  getJob(jobId: string): Promise<LineNotificationJobRecord | null>;
  findByBatchId(batchId: string): Promise<LineNotificationJobRecord | null>;
  listTerminalJobsUpdatedBefore(
    status: TerminalLineNotificationJobStatus,
    cutoff: number,
    limit: number,
  ): Promise<LineNotificationJobRecord[]>;
  listJobsByStatusUpdatedBefore(
    status: LineNotificationJobStatus,
    cutoff: number,
    limit: number,
  ): Promise<LineNotificationJobRecord[]>;
}

export interface LineNotificationJobStore extends LineNotificationJobReader {
  insert(fields: NewLineNotificationJobFields): Promise<string>;
  patch(
    jobId: string,
    fields: Partial<Omit<LineNotificationJobRecord, "id" | "creationTime">>,
  ): Promise<void>;
  delete(jobId: string): Promise<void>;
}

export interface LineNotificationEventStore {
  findByDedupeKey(dedupeKey: string): Promise<LineNotificationEventRecord | null>;
  listCreatedBefore(cutoff: number, limit: number): Promise<LineNotificationEventRecord[]>;
  insert(fields: NewLineNotificationEventFields): Promise<string>;
  delete(eventId: string): Promise<void>;
}

export interface LineNotificationScheduler {
  scheduleProcessJob(delayMs: number, jobId: string): Promise<void>;
  scheduleLeaseRecovery(jobId: string, attemptCount: number, runAt: number): Promise<void>;
  scheduleCleanup(delayMs: number): Promise<void>;
}
