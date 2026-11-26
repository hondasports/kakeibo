// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

type Classification = "household" | "system_admin" | "self" | "public";
type Kind = "query" | "mutation" | "action";
type ValidatorJson = {
  type?: string;
  value?: unknown;
  tableName?: string;
  optional?: boolean;
  fieldType?: ValidatorJson;
};
type PublicRow = { endpoint: string; kind: Kind; argsValidator: ValidatorJson };

const PUBLIC_FUNCTION_COVERAGE: Record<string, { classification: Classification; reason: string }> =
  {
    "accountDeletion:getAccountDeletionPreview": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "accountDeletion:getMyAccountDeletionStatus": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "accountDeletion:retryAccountDeletion": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "accountDeletionActions:requestAccountDeletion": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "aiExpenseDrafts/mutations:applyReceiptTaxSettings": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:deleteDraft": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:registerReadyDraftsAsExpenseEntries": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:resetReceiptToAiInterpretation": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:updateDraftItemTaxOverrides": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:updateForReview": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/mutations:updateRegisteredDraft": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/queries:getWithItems": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/queries:listByStatus": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "aiExpenseDrafts/queries:listByStatusPaginated": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:createCategory": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:deactivateCategory": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:moveCategory": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:reactivateCategory": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:seedDefaultCategories": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/mutations:updateCategory": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/queries:listActive": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "categories/queries:listForSettings": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "dataExport:listExportEntries": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "entryFavorites/mutations:deleteEntryFavorite": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "entryFavorites/mutations:saveEntryFavorite": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "entryFavorites/queries:listEntryFavorites": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:bulkDeleteSpendingRecords": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:bulkUpdateSpendingCategories": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:createExpenseEntries": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:createIncomeEntry": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:deleteExpenseEntry": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseEntries/mutations:updateExpenseEntry": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "expenseSearch:searchExpenses": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/auditLogs:listManagementAuditLogs": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/clerkInvitations:acceptInvitation": {
      classification: "self",
      reason: "招待 token と認証済み本人のメールアドレスに紐づく",
    },
    "groups/clerkInvitations:cancelPendingGroupInvitation": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/clerkInvitations:inviteMember": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/clerkInvitations:previewInvitation": {
      classification: "self",
      reason: "招待 token と認証済み本人のメールアドレスに紐づく",
    },
    "groups/deletion:getGroupDeletionPreview": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/deletion:getGroupDeletionStatus": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/deletion:requestGroupDeletion": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/deletion:resumeGroupDeletion": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/members:changeMemberRole": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/members:removeMember": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/members:transferGroupOwnership": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/mutations:createGroup": {
      classification: "self",
      reason: "未所属ユーザーが自分の最初のグループを作る onboarding 操作",
    },
    "groups/mutations:setActiveGroup": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/mutations:setMonthlyBudget": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/mutations:updateGroupName": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/queries:getGroupMembers": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/queries:getMyGroup": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/queries:listMyGroups": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "groups/queries:listPendingGroupInvitations": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "lineLink/actions:complete": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "lineLink/actions:start": { classification: "self", reason: "認証済み本人のデータだけを扱う" },
    "lineLink/mutations:unlink": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "lineLink/queries:getStatus": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "notificationSettings:getNotificationSettings": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "notificationSettings:updateNotificationSetting": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "notifications/mutations:updateMyNotificationPreference": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "notifications/queries:getMyNotificationSettings": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "receiptAnalysisJobs/actions:analyzeImageJob": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/mutations:cancelImageJob": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/mutations:createBatch": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/mutations:retryImageJob": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/queries:listActiveJobs": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/queries:listJobsByBatch": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receiptAnalysisJobs/queries:listJobsByDraftIds": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/crud:deleteReceipt": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/crud:updateReceipt": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/summaries:getFourWeeksSummary": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/summaries:getMonthSummaryWithCategories": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/summaries:getWeekSummary": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/summaries:getWeekSummaryWithCategories": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "receipts/summaries:getYearSummary": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "recurringRules/index:createRecurringRule": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "recurringRules/index:listRecurringRules": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "recurringRules/index:registerFromRecurringRule": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "recurringRules/index:setRecurringRuleActive": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "recurringRules/index:updateRecurringRule": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "savedExpenseSearches/mutations:deleteSavedExpenseSearch": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "savedExpenseSearches/mutations:recordRecentExpenseSearch": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "savedExpenseSearches/mutations:saveExpenseSearch": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "savedExpenseSearches/queries:listSavedExpenseSearches": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "systemAdminGroupDeletion:listGroupDeletionJobs": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminGroupDeletion:resumeGroupDeletion": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminMembership:systemAdminMembershipOperation": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminOwnerlessGroupRecovery:recoverOwnerlessGroup": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminPendingInvitationAction:systemAdminPendingInvitationRevoke": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminRoleOperations:systemAdminRoleOperation": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminSearch:getGroupDetail": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminSearch:getUserDetail": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminSearch:searchGroups": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdminSearch:searchUsers": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdmins:getMySystemAdminContext": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdmins:grantSystemAdmin": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdmins:listSystemAdminAuditLogs": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdmins:listSystemAdmins": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "systemAdmins:revokeSystemAdmin": {
      classification: "system_admin",
      reason: "system admin 権限の境界は systemAdminSecurityMatrix 等で確認する",
    },
    "users/mutations:acceptReceiptImageExternalApiConsent": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/mutations:updateMonthlyIncome": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/mutations:updateWeeklyDays": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/mutations:upsertUser": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/queries:getAuthenticatedUserId": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/queries:getReceiptImageConsent": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "users/queries:getUserProfile": {
      classification: "self",
      reason: "認証済み本人のデータだけを扱う",
    },
    "weekSessions/mutations:getOrCreateCurrentWeekSession": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
    "weekSessions/mutations:getOrCreateWeekSession": {
      classification: "household",
      reason: "所属グループの家計データを扱う",
    },
  };

// household 区分の拒否マトリクス。新しい household endpoint はここへの追加を強制する。
const HOUSEHOLD_MATRIX: Record<string, Record<string, never>> = {
  "aiExpenseDrafts/mutations:applyReceiptTaxSettings": {},
  "aiExpenseDrafts/mutations:deleteDraft": {},
  "aiExpenseDrafts/mutations:registerReadyDraftsAsExpenseEntries": {},
  "aiExpenseDrafts/mutations:resetReceiptToAiInterpretation": {},
  "aiExpenseDrafts/mutations:updateDraftItemTaxOverrides": {},
  "aiExpenseDrafts/mutations:updateForReview": {},
  "aiExpenseDrafts/mutations:updateRegisteredDraft": {},
  "aiExpenseDrafts/queries:getWithItems": {},
  "aiExpenseDrafts/queries:listByStatus": {},
  "aiExpenseDrafts/queries:listByStatusPaginated": {},
  "categories/mutations:createCategory": {},
  "categories/mutations:deactivateCategory": {},
  "categories/mutations:moveCategory": {},
  "categories/mutations:reactivateCategory": {},
  "categories/mutations:seedDefaultCategories": {},
  "categories/mutations:updateCategory": {},
  "categories/queries:listActive": {},
  "categories/queries:listForSettings": {},
  "dataExport:listExportEntries": {},
  "entryFavorites/mutations:deleteEntryFavorite": {},
  "entryFavorites/mutations:saveEntryFavorite": {},
  "entryFavorites/queries:listEntryFavorites": {},
  "expenseEntries/mutations:bulkDeleteSpendingRecords": {},
  "expenseEntries/mutations:bulkUpdateSpendingCategories": {},
  "expenseEntries/mutations:createExpenseEntries": {},
  "expenseEntries/mutations:createIncomeEntry": {},
  "expenseEntries/mutations:deleteExpenseEntry": {},
  "expenseEntries/mutations:updateExpenseEntry": {},
  "expenseSearch:searchExpenses": {},
  "groups/auditLogs:listManagementAuditLogs": {},
  "groups/clerkInvitations:cancelPendingGroupInvitation": {},
  "groups/clerkInvitations:inviteMember": {},
  "groups/deletion:getGroupDeletionPreview": {},
  "groups/deletion:getGroupDeletionStatus": {},
  "groups/deletion:requestGroupDeletion": {},
  "groups/deletion:resumeGroupDeletion": {},
  "groups/members:changeMemberRole": {},
  "groups/members:removeMember": {},
  "groups/members:transferGroupOwnership": {},
  "groups/mutations:setActiveGroup": {},
  "groups/mutations:setMonthlyBudget": {},
  "groups/mutations:updateGroupName": {},
  "groups/queries:getGroupMembers": {},
  "groups/queries:getMyGroup": {},
  "groups/queries:listMyGroups": {},
  "groups/queries:listPendingGroupInvitations": {},
  "receiptAnalysisJobs/actions:analyzeImageJob": {},
  "receiptAnalysisJobs/mutations:cancelImageJob": {},
  "receiptAnalysisJobs/mutations:createBatch": {},
  "receiptAnalysisJobs/mutations:retryImageJob": {},
  "receiptAnalysisJobs/queries:listActiveJobs": {},
  "receiptAnalysisJobs/queries:listJobsByBatch": {},
  "receiptAnalysisJobs/queries:listJobsByDraftIds": {},
  "receipts/crud:deleteReceipt": {},
  "receipts/crud:updateReceipt": {},
  "receipts/summaries:getFourWeeksSummary": {},
  "receipts/summaries:getMonthSummaryWithCategories": {},
  "receipts/summaries:getWeekSummary": {},
  "receipts/summaries:getWeekSummaryWithCategories": {},
  "receipts/summaries:getYearSummary": {},
  "recurringRules/index:createRecurringRule": {},
  "recurringRules/index:listRecurringRules": {},
  "recurringRules/index:registerFromRecurringRule": {},
  "recurringRules/index:setRecurringRuleActive": {},
  "recurringRules/index:updateRecurringRule": {},
  "savedExpenseSearches/mutations:deleteSavedExpenseSearch": {},
  "savedExpenseSearches/mutations:recordRecentExpenseSearch": {},
  "savedExpenseSearches/mutations:saveExpenseSearch": {},
  "savedExpenseSearches/queries:listSavedExpenseSearches": {},
  "weekSessions/mutations:getOrCreateCurrentWeekSession": {},
  "weekSessions/mutations:getOrCreateWeekSession": {},
};

const MEMBER_USER_ID = "matrix-member";
const NO_GROUP_USER_ID = "matrix-no-group";
const OTHER_USER_ID = "matrix-other-user";
const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

type TestT = ReturnType<typeof convexTest>;
type FixtureIds = Awaited<ReturnType<typeof seedBoundaryFixture>>;

function isRegistered(value: unknown): value is {
  isPublic: boolean;
  isMutation?: boolean;
  isQuery?: boolean;
  exportArgs: () => string;
} {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { exportArgs?: unknown }).exportArgs === "function"
  );
}

async function listPublicFunctions(): Promise<PublicRow[]> {
  const rows: PublicRow[] = [];
  for (const [moduleFile, load] of Object.entries(convexTestModules)) {
    if (
      moduleFile.includes("/_generated/") ||
      moduleFile.endsWith(".test.ts") ||
      moduleFile.endsWith("test.setup.ts")
    )
      continue;
    const mod = (await load()) as Record<string, unknown>;
    const modulePath = moduleFile.replace(/^\.\//, "").replace(/\.ts$/, "");
    for (const [exportName, value] of Object.entries(mod)) {
      if (!isRegistered(value) || !value.isPublic) continue;
      rows.push({
        endpoint: `${modulePath}:${exportName}`,
        kind: value.isMutation ? "mutation" : value.isQuery ? "query" : "action",
        argsValidator: JSON.parse(value.exportArgs()) as ValidatorJson,
      });
    }
  }
  return rows.sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

async function seedBoundaryFixture(t: TestT) {
  return await t.run(async (ctx) => {
    const homeGroupId = await ctx.db.insert("groups", {
      name: "matrix home",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherGroupId = await ctx.db.insert("groups", {
      name: "matrix other",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const memberUserDocId = await ctx.db.insert("users", {
      userId: MEMBER_USER_ID,
      displayName: "member",
      activeGroupId: homeGroupId,
      createdAt: 1,
      updatedAt: 1,
    });
    const noGroupUserDocId = await ctx.db.insert("users", {
      userId: NO_GROUP_USER_ID,
      displayName: "no group",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherUserDocId = await ctx.db.insert("users", {
      userId: OTHER_USER_ID,
      displayName: "other",
      activeGroupId: otherGroupId,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [groupId, userId] of [
      [homeGroupId, MEMBER_USER_ID],
      [otherGroupId, OTHER_USER_ID],
    ] as const) {
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const categoryBase = { color: "#000000", isActive: true, createdAt: 1, updatedAt: 1 };
    const homeCategoryId = await ctx.db.insert("categories", {
      ...categoryBase,
      groupId: homeGroupId,
      name: "home category",
      sortOrder: 0,
    });
    const otherCategoryId = await ctx.db.insert("categories", {
      ...categoryBase,
      groupId: otherGroupId,
      name: "other category",
      sortOrder: 0,
    });
    const otherSourceDocumentId = await ctx.db.insert("sourceDocuments", {
      groupId: otherGroupId,
      sourceType: "receipt",
      status: "ready",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherExpenseEntryId = await ctx.db.insert("expenseEntries", {
      groupId: otherGroupId,
      categoryId: otherCategoryId,
      date: "2026-01-01",
      amount: 100,
      title: "other expense",
      entryType: "expense",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherRecurringRuleId = await ctx.db.insert("recurringEntryRules", {
      groupId: otherGroupId,
      kind: "expense",
      title: "other recurring",
      amountYen: 100,
      categoryId: otherCategoryId,
      frequency: "weekly",
      dayOfWeek: 1,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherEntryFavoriteId = await ctx.db.insert("entryFavorites", {
      userId: OTHER_USER_ID,
      groupId: otherGroupId,
      title: "other favorite",
      categoryId: otherCategoryId,
      amountYen: 100,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherSavedExpenseSearchId = await ctx.db.insert("savedExpenseSearches", {
      userId: OTHER_USER_ID,
      groupId: otherGroupId,
      kind: "saved",
      name: "other search",
      query: "other",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherReceiptId = await ctx.db.insert("receipts", {
      groupId: otherGroupId,
      date: "2026-01-01",
      type: "expense",
      shopName: "other shop",
      amountYen: 100,
      categoryId: otherCategoryId,
      weekStartDate: "2025-12-29",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherDraftId = await ctx.db.insert("aiExpenseDrafts", {
      groupId: otherGroupId,
      createdByUserId: OTHER_USER_ID,
      sourceType: "image_upload",
      status: "ready",
      documentType: "receipt",
      categoryId: otherCategoryId,
      confidence: {},
      reviewReasons: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const otherDraftItemId = await ctx.db.insert("aiExpenseDraftItems", {
      groupId: otherGroupId,
      draftId: otherDraftId,
      itemName: "other item",
      amountYen: 100,
      categoryId: otherCategoryId,
      confidence: {},
      createdAt: 1,
      updatedAt: 1,
    });
    const otherBatchId = await ctx.db.insert("receiptAnalysisBatches", {
      groupId: otherGroupId,
      createdByUserId: OTHER_USER_ID,
      totalCount: 1,
      processedCount: 0,
      status: "running",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherImageJobId = await ctx.db.insert("receiptAnalysisImageJobs", {
      batchId: otherBatchId,
      groupId: otherGroupId,
      imageIndex: 0,
      fileName: "other.png",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherInvitationId = await ctx.db.insert("groupInvitations", {
      groupId: otherGroupId,
      email: "invite@example.test",
      token: "invite-token",
      status: "pending",
      invitedByUserId: OTHER_USER_ID,
      createdAt: 1,
      updatedAt: 1,
    });
    const otherGroupDeletionJobId = await ctx.db.insert("groupDeletionJobs", {
      targetGroupIdSnapshot: otherGroupId,
      targetGroupNameSnapshot: "matrix other",
      source: "owner",
      status: "requested",
      stage: "recipientSnapshot",
      isActive: true,
      attemptCount: 0,
      maxAttempts: 3,
      deletedCounts: {
        receiptAnalysisImageJobs: 0,
        aiExpenseDraftItems: 0,
        aiExpenseDrafts: 0,
        receiptAnalysisBatches: 0,
        expenseEntries: 0,
        receipts: 0,
        sourceDocuments: 0,
        storageFiles: 0,
        weekSessions: 0,
        categories: 0,
        groupInvitations: 0,
        managementAuditLogs: 0,
        groupMembers: 0,
        groups: 0,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    return {
      homeGroupId,
      otherGroupId,
      memberUserDocId,
      noGroupUserDocId,
      otherUserDocId,
      homeCategoryId,
      otherCategoryId,
      otherSourceDocumentId,
      otherExpenseEntryId,
      otherRecurringRuleId,
      otherEntryFavoriteId,
      otherSavedExpenseSearchId,
      otherReceiptId,
      otherDraftId,
      otherDraftItemId,
      otherBatchId,
      otherImageJobId,
      otherInvitationId,
      otherGroupDeletionJobId,
    };
  });
}

function idMap(ids: FixtureIds): Record<string, string> {
  return {
    groups: ids.otherGroupId,
    users: ids.otherUserDocId,
    categories: ids.otherCategoryId,
    sourceDocuments: ids.otherSourceDocumentId,
    expenseEntries: ids.otherExpenseEntryId,
    recurringEntryRules: ids.otherRecurringRuleId,
    entryFavorites: ids.otherEntryFavoriteId,
    savedExpenseSearches: ids.otherSavedExpenseSearchId,
    receipts: ids.otherReceiptId,
    aiExpenseDrafts: ids.otherDraftId,
    aiExpenseDraftItems: ids.otherDraftItemId,
    receiptAnalysisBatches: ids.otherBatchId,
    receiptAnalysisImageJobs: ids.otherImageJobId,
    groupInvitations: ids.otherInvitationId,
    groupDeletionJobs: ids.otherGroupDeletionJobId,
  };
}

function containsId(validator: ValidatorJson): boolean {
  if (validator.type === "id") return true;
  if (validator.type === "object" && validator.value && typeof validator.value === "object")
    return Object.values(validator.value as Record<string, { fieldType?: ValidatorJson }>).some(
      (field) => containsId(field.fieldType ?? {}),
    );
  if ((validator.type === "array" || validator.type === "union") && validator.value)
    return Array.isArray(validator.value)
      ? validator.value.some((item) => containsId(item as ValidatorJson))
      : containsId(validator.value as ValidatorJson);
  return false;
}

function valueFromValidator(
  validator: ValidatorJson,
  ids: Record<string, string>,
  includeIds: boolean,
): unknown {
  switch (validator.type) {
    case "string":
      return "test";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "literal":
      return validator.value;
    case "null":
      return null;
    case "id": {
      const id = ids[validator.tableName ?? ""];
      if (!id) throw new Error(`missing fixture id: ${validator.tableName}`);
      return id;
    }
    case "array": {
      const item = (validator.value ?? {}) as ValidatorJson;
      return includeIds && containsId(item) ? [valueFromValidator(item, ids, includeIds)] : [];
    }
    case "object": {
      const result: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(
        (validator.value ?? {}) as Record<string, { optional?: boolean; fieldType: ValidatorJson }>,
      )) {
        if (field.optional && !(includeIds && containsId(field.fieldType))) continue;
        result[key] = valueFromValidator(field.fieldType, ids, includeIds);
      }
      return result;
    }
    case "union": {
      const choices = (validator.value ?? []) as ValidatorJson[];
      const nullChoice = choices.find((choice) => choice.type === "null");
      return valueFromValidator(nullChoice ?? choices[0] ?? {}, ids, includeIds);
    }
    case "record":
      return {};
    case "bytes":
      return new ArrayBuffer(0);
    case "int64":
      return 1n;
    default:
      return {};
  }
}

function generateArgs(row: PublicRow, ids: FixtureIds, includeIds: boolean) {
  return valueFromValidator(row.argsValidator, idMap(ids), includeIds) as Record<string, unknown>;
}

function reference(endpoint: string, kind: Kind) {
  if (kind === "mutation")
    return makeFunctionReference<"mutation", Record<string, unknown>, unknown>(endpoint);
  if (kind === "action")
    return makeFunctionReference<"action", Record<string, unknown>, unknown>(endpoint);
  return makeFunctionReference<"query", Record<string, unknown>, unknown>(endpoint);
}

function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.page)) return record.page.length === 0;
  if (Array.isArray(record.items)) return record.items.length === 0;
  if (Object.keys(record).length === 1 && record.deleted === false) return true;
  return Object.keys(record).length === 0;
}

async function tableCounts(t: TestT) {
  const rows = await Promise.all(
    Object.keys(schema.tables).map(async (table) => [
      table,
      (await t.run(async (ctx) => (await ctx.db.query(table as never).collect()).length)) as number,
    ]),
  );
  return Object.fromEntries(rows) as Record<string, number>;
}

async function expectRejected(
  t: TestT,
  row: PublicRow,
  args: Record<string, unknown>,
  caller: Pick<TestT, Kind>,
) {
  const before = row.kind === "query" ? null : await tableCounts(t);
  let value: unknown;
  let resolved = false;
  try {
    value = await caller[row.kind](reference(row.endpoint, row.kind) as never, args);
    resolved = true;
  } catch {
    resolved = false;
  }
  if (resolved)
    expect(
      isEmptyResult(value),
      `${row.endpoint} resolved with non-empty value: ${JSON.stringify(value)}`,
    ).toBe(true);
  if (before !== null) {
    const after = await tableCounts(t);
    expect(
      Object.entries(after).filter(([table, count]) => count !== before[table]),
      `${row.endpoint} wrote to the database`,
    ).toEqual([]);
  }
}

const matrixEntries = Object.keys(HOUSEHOLD_MATRIX).map((endpoint) => ({ endpoint }));

describe("household group boundary matrix", () => {
  it("公開関数をすべて分類表に載せ、household 区分をマトリクスに入れる", async () => {
    const rows = await listPublicFunctions();
    const actual = rows.map((row) => row.endpoint);
    expect(actual.filter((endpoint) => !(endpoint in PUBLIC_FUNCTION_COVERAGE))).toEqual([]);
    expect(
      Object.keys(PUBLIC_FUNCTION_COVERAGE).filter((endpoint) => !actual.includes(endpoint)),
    ).toEqual([]);
    const householdEndpoints = actual.filter(
      (endpoint) => PUBLIC_FUNCTION_COVERAGE[endpoint]?.classification === "household",
    );
    expect(householdEndpoints.filter((endpoint) => !(endpoint in HOUSEHOLD_MATRIX))).toEqual([]);
    expect(
      Object.keys(HOUSEHOLD_MATRIX).filter(
        (endpoint) => PUBLIC_FUNCTION_COVERAGE[endpoint]?.classification !== "household",
      ),
    ).toEqual([]);
  });

  for (const mode of ["unauthenticated", "no_group"] as const) {
    it.each(matrixEntries)(
      `${mode} では $endpoint がデータを返さず書き込まない`,
      async ({ endpoint }) => {
        const rows = await listPublicFunctions();
        const row = rows.find((candidate) => candidate.endpoint === endpoint);
        expect(row, `missing public function: ${endpoint}`).toBeDefined();
        const t = convexTest(schema, convexTestModules);
        const ids = await seedBoundaryFixture(t);
        const args = generateArgs(row!, ids, false);
        const caller = mode === "no_group" ? t.withIdentity(identity(NO_GROUP_USER_ID)) : t;
        await expectRejected(t, row!, args, caller);
      },
    );
  }

  it.each(matrixEntries)(
    "別グループの記録 ID は $endpoint で受け入れない",
    async ({ endpoint }) => {
      const rows = await listPublicFunctions();
      const row = rows.find((candidate) => candidate.endpoint === endpoint);
      expect(row, `missing public function: ${endpoint}`).toBeDefined();
      if (!containsId(row!.argsValidator)) return;
      const t = convexTest(schema, convexTestModules);
      const ids = await seedBoundaryFixture(t);
      const args = generateArgs(row!, ids, true);
      await expectRejected(t, row!, args, t.withIdentity(identity(MEMBER_USER_ID)));
    },
  );
});
