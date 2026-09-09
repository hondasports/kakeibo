import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  aiExpenseDraftConfidenceValidator,
  aiExpenseDraftDocumentTypeValidator,
  aiExpenseDraftItemConfidenceValidator,
  aiExpenseDraftReviewReasonValidator,
  aiExpenseDraftSourceTypeValidator,
  aiExpenseDraftStatusValidator,
  amountBasisValidator,
  derivedRegistrationSnapshotValidator,
  markerDefinitionsValidator,
  receiptItemTaxRatePercentValidator,
  receiptMarkersValidator,
  receiptInterpretationSnapshotValidator,
  receiptRawObservationValidator,
  receiptTotalResolutionValidator,
  receiptTaxDecisionValidator,
  receiptUserOverrideSnapshotValidator,
  taxResolutionSourceValidator,
  taxResolutionStatusValidator,
  taxSummaryValidator,
} from "./aiExpenseDrafts/model";
import {
  managementAuditActionValidator,
  managementAuditTargetKindValidator,
} from "./groups/lib/managementAuditLogModel";
import {
  groupDeletionCountsValidator,
  groupDeletionSourceValidator,
  groupDeletionStageValidator,
  groupDeletionStatusValidator,
} from "./groups/lib/groupDeletionJobModel";
import {
  emailSuppressionReasonValidator,
  emailWebhookEventTypeValidator,
  transactionalEmailJobStatusValidator,
  transactionalEmailTypeValidator,
} from "./email/model";
import {
  lineLinkAuditActionValidator,
  lineLinkRequestStatusValidator,
  lineLinkStatusValidator,
} from "./lineLink/model";
import {
  lineImageJobStatusValidator,
  lineImageSkipReasonValidator,
  lineWebhookDeliveryValidator,
  lineWebhookEventTypeValidator,
} from "./lineWebhook/model";

export default defineSchema({
  users: defineTable({
    // userId には Clerk の tokenIdentifier を格納する。
    // 認可キーとして使用し、email は表示・補助用途に限定する。
    userId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    activeGroupId: v.optional(v.id("groups")),
    // monthlyIncome は月収入（円）。未設定の場合は optional で保持しない。
    monthlyIncome: v.optional(v.number()),
    // 週の開始曜日（0=日曜, 1=月曜, ..., 6=土曜）。未設定の場合は月曜(1)をデフォルトとする。
    weeklyStartDay: v.optional(v.number()),
    // 週の終了曜日（0=日曜, 1=月曜, ..., 6=土曜）。未設定の場合は日曜(0)をデフォルトとする。
    weeklyEndDay: v.optional(v.number()),
    // レシート画像を外部APIへ送信することへのユーザー承認時刻。
    receiptImageExternalApiConsentAcceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // by_token_identifier: userId フィールド（= Clerk の tokenIdentifier の値）で引く専用インデックス。
    // Issue #8 要件: users には by_token_identifier index を定義する。
    // 旧 by_user_id インデックスはこのインデックスに一本化した。
    .index("by_token_identifier", ["userId"])
    .index("by_email", ["email"])
    .index("by_created_at", ["createdAt"])
    .searchIndex("search_display_name", { searchField: "displayName" })
    .searchIndex("search_email", { searchField: "email" }),

  // LINE LoginはClerk認証を置き換えない外部連携として、tokenIdentifierで所有者を記録する。
  // state/nonceはハッシュのみ保存し、LINE userIdはUI・監査ログへ露出しない。
  lineLinkRequests: defineTable({
    userId: v.string(),
    stateHash: v.string(),
    nonceHash: v.string(),
    codeVerifier: v.string(),
    status: lineLinkRequestStatusValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_state_hash", ["stateHash"])
    .index("by_user_id_and_expires_at", ["userId", "expiresAt"])
    .index("by_expires_at", ["expiresAt"]),

  lineAccountLinks: defineTable({
    userId: v.string(),
    lineUserId: v.string(),
    status: lineLinkStatusValidator,
    linkedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user_id_and_status", ["userId", "status"])
    .index("by_line_user_id_and_status", ["lineUserId", "status"]),

  lineLinkAuditLogs: defineTable({
    userId: v.string(),
    action: lineLinkAuditActionValidator,
    result: v.union(v.literal("success"), v.literal("failure")),
    reasonCode: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user_id", ["userId"]),

  // raw payload・署名・LINE userId・replyTokenはこのテーブルへ保存せず、allowlistだけを保持する。
  // replyTokenはclaimと原子化した案内送信ジョブの引数としてのみ渡す。
  lineWebhookEvents: defineTable({
    webhookEventId: v.string(),
    eventType: lineWebhookEventTypeValidator,
    delivery: lineWebhookDeliveryValidator,
    userId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    messageText: v.optional(v.string()),
    postbackData: v.optional(v.string()),
    eventTimestamp: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_webhook_event_id", ["webhookEventId"])
    .index("by_user_id_and_created_at", ["userId", "createdAt"])
    .index("by_delivery_and_created_at", ["delivery", "createdAt"])
    .index("by_created_at", ["createdAt"]),

  // 画像本体は保存しない。messageId と処理状態だけを保持し、取得バイナリは action 内の一時値とする。
  lineImageJobs: defineTable({
    webhookEventId: v.string(),
    userId: v.string(),
    messageId: v.string(),
    status: lineImageJobStatusValidator,
    skipReason: v.optional(lineImageSkipReasonValidator),
    draftId: v.optional(v.id("aiExpenseDrafts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_webhook_event_id", ["webhookEventId"])
    .index("by_user_id_and_created_at", ["userId", "createdAt"])
    .index("by_created_at", ["createdAt"]),

  // ---------------------------------------------------------------------------
  // グループ管理テーブル（Issue #103: 家族グループへのアクセス変更）
  // ---------------------------------------------------------------------------

  groups: defineTable({
    name: v.string(),
    clerkOrganizationId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("deleting"),
        v.literal("deleted"),
        v.literal("archived"),
      ),
    ),
    deletedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" }),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    // userId には Clerk の tokenIdentifier を格納する。
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_group_id", ["groupId"])
    .index("by_group_id_and_role", ["groupId", "role"])
    .index("by_group_id_and_user_id", ["groupId", "userId"]),

  groupInvitations: defineTable({
    groupId: v.id("groups"),
    email: v.string(),
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    invitedByUserId: v.string(),
    clerkInvitationId: v.optional(v.string()),
    acceptedByUserId: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_group_id", ["groupId"])
    .index("by_email", ["email"])
    .index("by_group_id_and_email", ["groupId", "email"])
    .index("by_group_id_and_status", ["groupId", "status"]),

  managementAuditLogs: defineTable({
    groupId: v.id("groups"),
    actorUserId: v.string(),
    action: managementAuditActionValidator,
    targetKind: managementAuditTargetKindValidator,
    targetId: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    beforeValue: v.optional(v.string()),
    afterValue: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_group_id_and_created_at", ["groupId", "createdAt"])
    .index("by_action_and_created_at", ["action", "createdAt"]),

  systemAdmins: defineTable({
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
    grantedAt: v.number(),
    grantedByUserId: v.optional(v.id("users")),
    grantReason: v.string(),
    revokedAt: v.optional(v.number()),
    revokedByUserId: v.optional(v.id("users")),
    revokeReason: v.optional(v.string()),
  })
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"]),

  systemAdminAuditLogs: defineTable({
    action: v.union(
      v.literal("system_admin_bootstrapped"),
      v.literal("system_admin_granted"),
      v.literal("system_admin_revoked"),
      v.literal("system_admin_recovered"),
      v.literal("system_admin_user_searched"),
      v.literal("system_admin_group_searched"),
      v.literal("system_admin_user_viewed"),
      v.literal("system_admin_group_viewed"),
      v.literal("system_admin_membership_added"),
      v.literal("system_admin_membership_removed"),
      v.literal("system_admin_membership_transferred"),
      v.literal("system_admin_active_group_set"),
      v.literal("system_admin_active_group_cleared"),
      v.literal("system_admin_group_deletion_resumed"),
      v.literal("system_admin_ownerless_group_recovered"),
      v.literal("system_admin_group_role_changed"),
      v.literal("system_admin_group_owner_transferred"),
      v.literal("system_admin_group_invitation_revoked"),
    ),
    actorType: v.union(v.literal("system"), v.literal("system_admin")),
    actorUserId: v.optional(v.id("users")),
    targetKind: v.union(
      v.literal("system_admin"),
      v.literal("user"),
      v.literal("group"),
      v.literal("invitation"),
    ),
    targetUserId: v.optional(v.id("users")),
    targetDisplayNameSnapshot: v.optional(v.string()),
    sourceUserId: v.optional(v.id("users")),
    sourceUserDisplayNameSnapshot: v.optional(v.string()),
    targetId: v.optional(v.string()),
    reason: v.optional(v.string()),
    queryType: v.optional(v.string()),
    queryHash: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    previousStatus: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
    newStatus: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
    sourceGroupId: v.optional(v.id("groups")),
    sourceGroupNameSnapshot: v.optional(v.string()),
    targetGroupId: v.optional(v.id("groups")),
    targetGroupNameSnapshot: v.optional(v.string()),
    beforeMembershipStatus: v.optional(
      v.union(v.literal("none"), v.literal("member"), v.literal("owner")),
    ),
    afterMembershipStatus: v.optional(
      v.union(v.literal("none"), v.literal("member"), v.literal("owner")),
    ),
    beforeActiveGroupId: v.optional(v.id("groups")),
    afterActiveGroupId: v.optional(v.id("groups")),
    beforeOwnerCount: v.optional(v.number()),
    afterOwnerCount: v.optional(v.number()),
    result: v.optional(v.union(v.literal("success"), v.literal("denied"))),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_action_and_created_at", ["action", "createdAt"])
    .index("by_actor_user_id_and_created_at", ["actorUserId", "createdAt"])
    .index("by_target_user_id_and_created_at", ["targetUserId", "createdAt"])
    .index("by_action_and_actor_user_id_and_created_at", ["action", "actorUserId", "createdAt"])
    .index("by_action_and_target_user_id_and_created_at", ["action", "targetUserId", "createdAt"])
    .index("by_actor_user_id_and_target_user_id_and_created_at", [
      "actorUserId",
      "targetUserId",
      "createdAt",
    ])
    .index("by_action_and_actor_user_id_and_target_user_id_and_created_at", [
      "action",
      "actorUserId",
      "targetUserId",
      "createdAt",
    ])
    .index("by_target_kind_and_target_id_and_created_at", ["targetKind", "targetId", "createdAt"]),

  systemAdminNotifications: defineTable({
    action: v.union(
      v.literal("system_admin_granted"),
      v.literal("system_admin_revoked"),
      v.literal("system_admin_recovered"),
      v.literal("system_admin_bootstrapped"),
      v.literal("system_admin_membership_changed"),
      v.literal("system_admin_ownerless_group_recovered"),
      v.literal("system_admin_group_invitation_revoked"),
    ),
    recipientUserId: v.optional(v.id("users")),
    recipientEmail: v.optional(v.string()),
    targetUserId: v.optional(v.id("users")),
    targetEmailSnapshot: v.optional(v.string()),
    dedupeKey: v.string(),
    payloadJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_recipient_and_created_at", ["recipientUserId", "createdAt"])
    .index("by_recipient_and_target_user_id_and_created_at", [
      "recipientUserId",
      "targetUserId",
      "createdAt",
    ]),

  e2eSystemAdminMembershipFixtures: defineTable({
    prefix: v.string(),
    actorUserId: v.id("users"),
    targetUserId: v.id("users"),
    groupA: v.id("groups"),
    groupB: v.id("groups"),
    createdAt: v.number(),
  }).index("by_prefix", ["prefix"]),

  e2eSystemAdminSearchFixtures: defineTable({
    prefix: v.string(),
    actorUserId: v.id("users"),
    userIds: v.array(v.id("users")),
    groupIds: v.array(v.id("groups")),
    createdAdmin: v.boolean(),
    createdAt: v.number(),
  }).index("by_prefix", ["prefix"]),

  groupDeletionAuditMigrationRecords: defineTable({
    recordKind: v.literal("legacy_audit"),
    legacyAuditId: v.string(),
    actorUserIdSnapshot: v.string(),
    targetGroupIdSnapshot: v.string(),
    targetGroupNameSnapshot: v.optional(v.string()),
    deletedCounts: groupDeletionCountsValidator,
    sourceCreatedAt: v.number(),
    status: v.union(v.literal("migrated"), v.literal("skipped"), v.literal("failed")),
    skipReason: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_legacy_audit_id", ["legacyAuditId"])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  groupDeletionJobs: defineTable({
    targetGroupIdSnapshot: v.string(),
    targetGroupNameSnapshot: v.string(),
    source: groupDeletionSourceValidator,
    actorUserIdSnapshot: v.optional(v.string()),
    status: groupDeletionStatusValidator,
    stage: groupDeletionStageValidator,
    isActive: v.boolean(),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    lastErrorCategory: v.optional(v.string()),
    snapshotCursor: v.optional(v.string()),
    failureNotificationHandledAt: v.optional(v.number()),
    failureNotificationAttemptCount: v.optional(v.number()),
    deletedCounts: groupDeletionCountsValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_target_group_id_snapshot_and_is_active", ["targetGroupIdSnapshot", "isActive"])
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_updated_at", ["updatedAt"])
    .index("by_source_and_updated_at", ["source", "updatedAt"]),

  groupDeletionNotificationRecipients: defineTable({
    jobId: v.id("groupDeletionJobs"),
    recipientUserId: v.string(),
    startedHandledAt: v.optional(v.number()),
    completedHandledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_id", ["jobId"])
    .index("by_job_id_and_recipient_user_id", ["jobId", "recipientUserId"])
    .index("by_job_id_and_started_handled_at", ["jobId", "startedHandledAt"])
    .index("by_job_id_and_completed_handled_at", ["jobId", "completedHandledAt"]),

  // ---------------------------------------------------------------------------
  // データテーブル（userId → groupId に変更済み）
  // ---------------------------------------------------------------------------

  sourceDocuments: defineTable({
    groupId: v.id("groups"),
    sourceType: v.union(
      v.literal("manual"),
      v.literal("receipt"),
      v.literal("convenience_payment"),
      v.literal("invoice"),
      v.literal("unknown"),
    ),
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("finalized")),
    date: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    shopName: v.optional(v.string()),
    paymentPlace: v.optional(v.string()),
    payeeName: v.optional(v.string()),
    paymentPurpose: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_status_and_created_at", ["groupId", "status", "createdAt"])
    .index("by_group_id_and_date", ["groupId", "date"]),

  expenseEntries: defineTable({
    groupId: v.id("groups"),
    // 作成者はE2E cleanupの削除範囲をテストユーザー自身に限定するために保持する。
    // 既存データとの後方互換性のため optional とする。
    createdByUserId: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("sourceDocuments")),
    aiExpenseDraftId: v.optional(v.id("aiExpenseDrafts")),
    date: v.string(),
    amount: v.number(),
    // 支出では必須。収入はカテゴリを作らず entryType で区別するため未設定。
    categoryId: v.optional(v.id("categories")),
    title: v.string(),
    memo: v.optional(v.string()),
    entryType: v.union(v.literal("expense"), v.literal("income")),
    source: v.union(v.literal("manual"), v.literal("ai_suggested"), v.literal("imported")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_date", ["groupId", "date"])
    .index("by_group_id_and_created_by_user_id", ["groupId", "createdByUserId"])
    .index("by_group_id_and_category_id_and_date", ["groupId", "categoryId", "date"])
    .index("by_group_id_and_source_document_id", ["groupId", "sourceDocumentId"])
    .index("by_group_id_and_ai_expense_draft_id", ["groupId", "aiExpenseDraftId"]),

  receipts: defineTable({
    groupId: v.id("groups"),
    // 既存データとの後方互換性を保ちつつ、E2E cleanupの削除範囲を限定する。
    createdByUserId: v.optional(v.string()),
    date: v.string(),
    // type は支出(expense) / 収入(income) を区別する。既存レコードとの後方互換のため optional とする。
    type: v.optional(v.union(v.literal("expense"), v.literal("income"))),
    // shopName は支出の場合に使用する。後方互換のため optional とする。
    shopName: v.optional(v.string()),
    // bankName は収入の場合に使用する。
    bankName: v.optional(v.string()),
    amountYen: v.number(),
    categoryId: v.id("categories"),
    // memo は任意入力のため optional とする。
    memo: v.optional(v.string()),
    weekStartDate: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_week_start_date", ["groupId", "weekStartDate"])
    .index("by_group_id_and_created_by_user_id", ["groupId", "createdByUserId"])
    .index("by_group_id_and_date", ["groupId", "date"])
    .index("by_group_id_and_shop_name", ["groupId", "shopName"]),

  weekSessions: defineTable({
    groupId: v.id("groups"),
    weekStartDate: v.string(),
    weekEndDate: v.string(),
    // reviewMemo は週次セッション完了時のみ入力するため optional とする。
    reviewMemo: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("completed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_group_id_and_week_start_date", ["groupId", "weekStartDate"]),

  categories: defineTable({
    groupId: v.id("groups"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_is_active_and_sort_order", ["groupId", "isActive", "sortOrder"])
    .index("by_group_id_and_sort_order", ["groupId", "sortOrder"]),

  aiExpenseDrafts: defineTable({
    groupId: v.id("groups"),
    // E2E cleanupで他メンバーの下書きを削除しないための作成者識別子。
    createdByUserId: v.optional(v.string()),
    sourceType: aiExpenseDraftSourceTypeValidator,
    status: aiExpenseDraftStatusValidator,
    documentType: aiExpenseDraftDocumentTypeValidator,
    // 既存の dev 下書きに残っている画像ファイル名。新規コードでは必須にしない。
    imageFileName: v.optional(v.string()),
    shopName: v.optional(v.string()),
    paymentPlace: v.optional(v.string()),
    payeeName: v.optional(v.string()),
    paymentPurpose: v.optional(v.string()),
    date: v.optional(v.string()),
    amountYen: v.optional(v.number()),
    taxSummaries: v.optional(v.array(taxSummaryValidator)),
    receiptTotalResolution: v.optional(receiptTotalResolutionValidator),
    receiptTaxDecision: v.optional(receiptTaxDecisionValidator),
    // v1以前の下書きを読み続けるためoptional。新規解析だけがv1をdual-writeする。
    receiptDataContractVersion: v.optional(v.literal(1)),
    rawObservation: v.optional(receiptRawObservationValidator),
    receiptInterpretation: v.optional(receiptInterpretationSnapshotValidator),
    receiptUserOverride: v.optional(receiptUserOverrideSnapshotValidator),
    // 未設定の既存下書きは detailed として扱う。
    registrationMode: v.optional(v.union(v.literal("detailed"), v.literal("totalOnly"))),
    derivedRegistration: v.optional(derivedRegistrationSnapshotValidator),
    markerDefinitions: v.optional(markerDefinitionsValidator),
    categoryId: v.optional(v.id("categories")),
    confidence: aiExpenseDraftConfidenceValidator,
    // 既存の dev 下書きには warnings が無いものがあるため optional とする。
    warnings: v.optional(v.array(v.string())),
    reviewReasons: v.array(aiExpenseDraftReviewReasonValidator),
    registeredReceiptId: v.optional(v.id("receipts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_status_and_created_at", ["groupId", "status", "createdAt"])
    .index("by_group_id_and_created_by_user_id", ["groupId", "createdByUserId"])
    .index("by_group_id_and_created_at", ["groupId", "createdAt"])
    .index("by_group_id_and_registered_receipt_id", ["groupId", "registeredReceiptId"]),

  aiExpenseDraftItems: defineTable({
    groupId: v.id("groups"),
    draftId: v.id("aiExpenseDrafts"),
    itemName: v.string(),
    lineType: v.optional(
      v.union(
        v.literal("item"),
        v.literal("discount"),
        v.literal("promotion_adjustment"),
        v.literal("unknown"),
      ),
    ),
    amountYen: v.number(),
    printedAmountYen: v.optional(v.number()),
    amountBasis: v.optional(amountBasisValidator),
    taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
    markers: v.optional(receiptMarkersValidator),
    taxMarker: v.optional(v.string()),
    allocatedTaxYen: v.optional(v.number()),
    taxAllocationStatus: v.optional(v.union(v.literal("allocated"), v.literal("unallocated"))),
    normalizedAmountYen: v.optional(v.number()),
    taxResolutionStatus: v.optional(taxResolutionStatusValidator),
    taxResolutionSource: v.optional(taxResolutionSourceValidator),
    taxReviewReasons: v.optional(v.array(v.string())),
    quantity: v.optional(v.number()),
    unitPriceYen: v.optional(v.number()),
    categoryName: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    confidence: aiExpenseDraftItemConfidenceValidator,
    warnings: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_draft_id", ["draftId"])
    .index("by_group_id_and_draft_id", ["groupId", "draftId"]),

  receiptAnalysisBatches: defineTable({
    groupId: v.id("groups"),
    createdByUserId: v.optional(v.string()),
    totalCount: v.number(),
    processedCount: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("partially_failed"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    aiReviewNotificationScheduledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id_and_status", ["groupId", "status"])
    .index("by_group_id_and_created_by_user_id", ["groupId", "createdByUserId"])
    .index("by_group_id_and_created_at", ["groupId", "createdAt"]),

  receiptAnalysisImageJobs: defineTable({
    batchId: v.id("receiptAnalysisBatches"),
    groupId: v.id("groups"),
    imageIndex: v.number(),
    fileName: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("needs_review"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    draftId: v.optional(v.id("aiExpenseDrafts")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_batch_id", ["batchId"])
    .index("by_group_id_and_status", ["groupId", "status", "createdAt"])
    .index("by_draft_id", ["draftId"]),

  transactionalEmailJobs: defineTable({
    templateType: transactionalEmailTypeValidator,
    payloadJson: v.string(),
    recipientEmail: v.string(),
    normalizedRecipientEmail: v.string(),
    subject: v.string(),
    businessDedupeKey: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    provider: v.string(),
    status: transactionalEmailJobStatusValidator,
    providerMessageId: v.optional(v.string()),
    lastProviderEventAt: v.optional(v.number()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_provider_message_id", ["providerMessageId"])
    .index("by_normalized_recipient_email", ["normalizedRecipientEmail"])
    .index("by_next_retry_at", ["nextRetryAt"])
    .index("by_business_dedupe_key", ["businessDedupeKey"]),

  emailSuppressions: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    reason: emailSuppressionReasonValidator,
    source: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_email", ["normalizedEmail"])
    .index("by_provider_message_id", ["providerMessageId"]),

  emailWebhookEvents: defineTable({
    svixId: v.string(),
    provider: v.string(),
    eventType: emailWebhookEventTypeValidator,
    providerMessageId: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    payloadJson: v.string(),
    eventCreatedAt: v.optional(v.number()),
    processedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_svix_id", ["svixId"])
    .index("by_provider_message_id_and_event_created_at", ["providerMessageId", "eventCreatedAt"])
    .index("by_processed_at", ["processedAt"]),

  accountDeletionRequests: defineTable({
    userId: v.string(),
    clerkUserId: v.string(),
    recipientEmailSnapshot: v.optional(v.string()),
    status: v.union(
      v.literal("requested"),
      v.literal("preparing_groups"),
      v.literal("purging_groups"),
      v.literal("deleting_identity"),
      v.literal("retry_wait"),
      v.literal("identity_deleted"),
      v.literal("finalization_retry_wait"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    leftGroupCount: v.number(),
    deletedGroupCount: v.number(),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    identityDeletedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    preparationCursor: v.optional(v.string()),
    preparationCompletedAt: v.optional(v.number()),
  })
    .index("by_user_id", ["userId"])
    .index("by_status_and_updated_at", ["status", "updatedAt"])
    .index("by_next_retry_at", ["nextRetryAt"]),

  accountDeletionGroupPurges: defineTable({
    requestId: v.id("accountDeletionRequests"),
    groupDeletionJobId: v.id("groupDeletionJobs"),
    targetGroupIdSnapshot: v.string(),
    targetGroupNameSnapshot: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("completed"),
    ),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_request_id", ["requestId"])
    .index("by_request_id_and_status", ["requestId", "status"])
    .index("by_group_deletion_job_id", ["groupDeletionJobId"]),
});
