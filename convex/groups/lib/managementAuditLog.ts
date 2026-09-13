import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { createManagementAuditLogRecorder } from "../../../lib/convex/groups/convexManagementAuditLog";
import type { ManagementAuditAction, ManagementAuditTargetKind } from "./managementAuditLogModel";

export type RecordManagementAuditLogArgs = {
  groupId: Id<"groups">;
  actorUserId: string;
  action: ManagementAuditAction;
  targetKind: ManagementAuditTargetKind;
  targetId?: string;
  targetLabel?: string;
  beforeValue?: string;
  afterValue?: string;
};

/**
 * 監査ログを記録する。実装は infrastructure 層のレコーダーポートへ委譲する。
 * @returns 記録した監査ログ ID
 */
export async function recordManagementAuditLog(
  ctx: Pick<MutationCtx, "db">,
  args: RecordManagementAuditLogArgs,
): Promise<Id<"managementAuditLogs">> {
  return (await createManagementAuditLogRecorder(ctx).record(args)) as Id<"managementAuditLogs">;
}
