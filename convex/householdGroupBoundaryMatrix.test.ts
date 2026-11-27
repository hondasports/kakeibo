// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

const { clerkCreateInvitation, clerkRevokeInvitation, clerkGetUser } = vi.hoisted(() => ({
  clerkCreateInvitation: vi.fn(),
  clerkRevokeInvitation: vi.fn(),
  clerkGetUser: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    invitations: {
      createInvitation: clerkCreateInvitation,
      revokeInvitation: clerkRevokeInvitation,
    },
    users: { getUser: clerkGetUser },
  }),
}));

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
const HOME_MEMBER_USER_ID = "matrix-home-member";
const OTHER_MEMBER_USER_ID = "matrix-other-member";
const VALID_IMAGE_DATA_URL = "data:image/jpeg;base64," + "A".repeat(100);
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
    const homeDeletingGroupId = await ctx.db.insert("groups", {
      name: "matrix home deleting",
      status: "deleting",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherDeletingGroupId = await ctx.db.insert("groups", {
      name: "matrix other deleting",
      status: "deleting",
      createdAt: 1,
      updatedAt: 1,
    });
    const memberUserDocId = await ctx.db.insert("users", {
      userId: MEMBER_USER_ID,
      displayName: "member",
      activeGroupId: homeGroupId,
      receiptImageExternalApiConsentAcceptedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const homeMemberUserDocId = await ctx.db.insert("users", {
      userId: HOME_MEMBER_USER_ID,
      displayName: "home member",
      activeGroupId: homeGroupId,
      createdAt: 1,
      updatedAt: 1,
    });
    const noGroupUserDocId = await ctx.db.insert("users", {
      userId: NO_GROUP_USER_ID,
      displayName: "no group",
      receiptImageExternalApiConsentAcceptedAt: 1,
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
    await ctx.db.insert("users", {
      userId: OTHER_MEMBER_USER_ID,
      displayName: "other member",
      activeGroupId: otherGroupId,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [groupId, userId, role] of [
      [homeGroupId, MEMBER_USER_ID, "owner"],
      [homeGroupId, HOME_MEMBER_USER_ID, "member"],
      [otherGroupId, OTHER_USER_ID, "owner"],
      [otherGroupId, OTHER_MEMBER_USER_ID, "member"],
    ] as const) {
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role,
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
    const homeSecondCategoryId = await ctx.db.insert("categories", {
      ...categoryBase,
      groupId: homeGroupId,
      name: "home second category",
      sortOrder: 1,
    });
    const homeInactiveCategoryId = await ctx.db.insert("categories", {
      ...categoryBase,
      groupId: homeGroupId,
      name: "home inactive category",
      sortOrder: 2,
      isActive: false,
    });
    const otherCategoryId = await ctx.db.insert("categories", {
      ...categoryBase,
      groupId: otherGroupId,
      name: "other category",
      sortOrder: 0,
    });

    const insertSourceDocument = (groupId: typeof homeGroupId | typeof otherGroupId) =>
      ctx.db.insert("sourceDocuments", {
        groupId,
        sourceType: "receipt",
        status: "ready",
        date: "2026-01-01",
        totalAmount: 100,
        shopName: "shop",
        createdAt: 1,
        updatedAt: 1,
      });
    const homeSourceDocumentId = await insertSourceDocument(homeGroupId);
    const otherSourceDocumentId = await insertSourceDocument(otherGroupId);

    const insertExpenseEntry = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
      title: string,
      amount: number,
    ) =>
      ctx.db.insert("expenseEntries", {
        groupId,
        categoryId,
        date: "2026-01-01",
        amount,
        title,
        entryType: "expense",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      });
    const homeExpenseEntryId = await insertExpenseEntry(
      homeGroupId,
      homeCategoryId,
      "home expense",
      100,
    );
    const otherExpenseEntryId = await insertExpenseEntry(
      otherGroupId,
      otherCategoryId,
      "other expense",
      300,
    );

    const insertRecurringRule = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
      title: string,
    ) =>
      ctx.db.insert("recurringEntryRules", {
        groupId,
        kind: "expense",
        title,
        amountYen: 100,
        categoryId,
        frequency: "weekly",
        dayOfWeek: 1,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
    const homeRecurringRuleId = await insertRecurringRule(
      homeGroupId,
      homeCategoryId,
      "home recurring",
    );
    const otherRecurringRuleId = await insertRecurringRule(
      otherGroupId,
      otherCategoryId,
      "other recurring",
    );

    const insertEntryFavorite = (
      userId: string,
      groupId: typeof homeGroupId | typeof otherGroupId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
      title: string,
    ) =>
      ctx.db.insert("entryFavorites", {
        userId,
        groupId,
        title,
        categoryId,
        amountYen: 100,
        createdAt: 1,
        updatedAt: 1,
      });
    const homeEntryFavoriteId = await insertEntryFavorite(
      MEMBER_USER_ID,
      homeGroupId,
      homeCategoryId,
      "home favorite",
    );
    const otherEntryFavoriteId = await insertEntryFavorite(
      OTHER_USER_ID,
      otherGroupId,
      otherCategoryId,
      "other favorite",
    );

    const insertSavedSearch = (
      userId: string,
      groupId: typeof homeGroupId | typeof otherGroupId,
      name: string,
    ) =>
      ctx.db.insert("savedExpenseSearches", {
        userId,
        groupId,
        kind: "saved",
        name,
        query: "query",
        createdAt: 1,
        updatedAt: 1,
      });
    const homeSavedExpenseSearchId = await insertSavedSearch(
      MEMBER_USER_ID,
      homeGroupId,
      "home search",
    );
    const otherSavedExpenseSearchId = await insertSavedSearch(
      OTHER_USER_ID,
      otherGroupId,
      "other search",
    );

    const insertReceipt = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
      shopName: string,
      amountYen: number,
    ) =>
      ctx.db.insert("receipts", {
        groupId,
        date: "2026-01-01",
        type: "expense",
        shopName,
        amountYen,
        categoryId,
        weekStartDate: "2025-12-29",
        createdAt: 1,
        updatedAt: 1,
      });
    const homeReceiptId = await insertReceipt(homeGroupId, homeCategoryId, "home shop", 100);
    const otherReceiptId = await insertReceipt(otherGroupId, otherCategoryId, "other shop", 300);

    const confidence = { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 };
    const itemConfidence = { itemName: 1, amountYen: 1, categoryId: 1 };
    const draftSnapshotValues = (
      groupCategoryId: typeof homeCategoryId | typeof otherCategoryId,
      status: "ready" | "needs_review",
    ) => ({
      status,
      documentType: "receipt" as const,
      shopName: "shop",
      date: "2026-01-01",
      amountYen: 100,
      registrationMode: "totalOnly" as const,
      categoryId: groupCategoryId,
      confidence,
      warnings: [],
      reviewReasons: [],
      items: [
        {
          itemName: "item",
          amountYen: 100,
          categoryId: groupCategoryId,
          confidence: itemConfidence,
        },
      ],
    });
    const insertDraft = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
      createdByUserId: string,
      status: "ready" | "needs_review" | "registered",
    ) =>
      ctx.db.insert("aiExpenseDrafts", {
        groupId,
        createdByUserId,
        sourceType: "image_upload",
        status,
        documentType: "receipt",
        shopName: "shop",
        date: "2026-01-01",
        amountYen: 100,
        receiptTotalResolution: {
          status: "verified",
          protectedAmountYen: 100,
          candidates: [{ amountYen: 100, source: "user_confirmed", evidence: "fixture" }],
          reasons: [],
        },
        taxSummaries: [
          {
            taxRatePercent: 10,
            taxMode: "included",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_included",
            taxYen: 9,
            roundingMethod: "floor",
            confidence: {},
            warnings: [],
          },
        ],
        registrationMode: "totalOnly",
        categoryId,
        confidence,
        warnings: [],
        reviewReasons: [],
        listSummary: { amountAndTaxResolved: true },
        receiptInterpretation: {
          source: "ai",
          interpretedAt: 1,
          values: draftSnapshotValues(categoryId, status === "registered" ? "ready" : status),
        },
        ...(status === "registered"
          ? {
              registeredAt: 1,
              derivedRegistration: {
                source: "derived" as const,
                destination: "expense_entries" as const,
                registrationMode: "totalOnly" as const,
                amountYen: 100,
                date: "2026-01-01",
                categoryIds: [categoryId],
                registeredAt: 1,
              },
            }
          : {}),
        createdAt: 1,
        updatedAt: 1,
      });
    const homeReadyDraftId = await insertDraft(
      homeGroupId,
      homeCategoryId,
      MEMBER_USER_ID,
      "ready",
    );
    const homeRegisteredDraftId = await insertDraft(
      homeGroupId,
      homeCategoryId,
      MEMBER_USER_ID,
      "registered",
    );
    const otherDraftId = await insertDraft(otherGroupId, otherCategoryId, OTHER_USER_ID, "ready");

    const insertDraftItem = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      draftId: typeof homeReadyDraftId,
      categoryId: typeof homeCategoryId | typeof otherCategoryId,
    ) =>
      ctx.db.insert("aiExpenseDraftItems", {
        groupId,
        draftId,
        itemName: "item",
        amountYen: 100,
        categoryId,
        confidence: itemConfidence,
        createdAt: 1,
        updatedAt: 1,
      });
    const homeReadyDraftItemId = await insertDraftItem(
      homeGroupId,
      homeReadyDraftId,
      homeCategoryId,
    );
    const homeRegisteredDraftItemId = await insertDraftItem(
      homeGroupId,
      homeRegisteredDraftId,
      homeCategoryId,
    );
    const otherDraftItemId = await insertDraftItem(otherGroupId, otherDraftId, otherCategoryId);

    const insertBatch = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      createdByUserId: string,
    ) =>
      ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        createdByUserId,
        totalCount: 1,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
    const homeBatchId = await insertBatch(homeGroupId, MEMBER_USER_ID);
    const otherBatchId = await insertBatch(otherGroupId, OTHER_USER_ID);

    const insertImageJob = (
      batchId: typeof homeBatchId,
      groupId: typeof homeGroupId | typeof otherGroupId,
      draftId?: typeof homeReadyDraftId,
      status: "queued" | "failed" = "queued",
    ) =>
      ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId,
        imageIndex: 0,
        fileName: "receipt.jpg",
        status,
        ...(draftId === undefined ? {} : { draftId }),
        createdAt: 1,
        updatedAt: 1,
      });
    const homeImageJobId = await insertImageJob(homeBatchId, homeGroupId);
    const homeRetryImageJobId = await insertImageJob(
      homeBatchId,
      homeGroupId,
      homeReadyDraftId,
      "failed",
    );
    const otherImageJobId = await insertImageJob(otherBatchId, otherGroupId, otherDraftId);

    const insertInvitation = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      invitedByUserId: string,
      email: string,
    ) =>
      ctx.db.insert("groupInvitations", {
        groupId,
        email,
        token: `${email}-token`,
        status: "pending",
        invitedByUserId,
        clerkInvitationId: `${email}-clerk`,
        createdAt: 1,
        updatedAt: 1,
      });
    const homeInvitationId = await insertInvitation(
      homeGroupId,
      MEMBER_USER_ID,
      "home-invite@example.test",
    );
    const otherInvitationId = await insertInvitation(
      otherGroupId,
      OTHER_USER_ID,
      "other-invite@example.test",
    );

    const deletedCounts = {
      receiptAnalysisImageJobs: 0,
      aiExpenseDraftItems: 0,
      aiExpenseDrafts: 0,
      receiptAnalysisBatches: 0,
      expenseEntries: 0,
      receipts: 0,
      entryFavorites: 0,
      sourceDocuments: 0,
      storageFiles: 0,
      weekSessions: 0,
      categories: 0,
      groupInvitations: 0,
      managementAuditLogs: 0,
      groupMembers: 0,
      groups: 0,
      recurringEntryRules: 0,
      savedExpenseSearches: 0,
    };
    const insertDeletionJob = (
      groupId: typeof homeGroupId | typeof otherGroupId,
      groupName: string,
      actorUserIdSnapshot: string,
    ) =>
      ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: groupId,
        targetGroupNameSnapshot: groupName,
        source: "owner",
        actorUserIdSnapshot,
        status: "failed",
        stage: "categories",
        isActive: false,
        attemptCount: 6,
        maxAttempts: 6,
        lastErrorCategory: "batch_processing_failed",
        deletedCounts,
        createdAt: 1,
        updatedAt: 1,
      });
    const homeGroupDeletionJobId = await insertDeletionJob(
      homeDeletingGroupId,
      "matrix home deleting",
      MEMBER_USER_ID,
    );
    const otherGroupDeletionJobId = await insertDeletionJob(
      otherDeletingGroupId,
      "matrix other deleting",
      OTHER_USER_ID,
    );

    await ctx.db.insert("managementAuditLogs", {
      groupId: homeGroupId,
      actorUserId: MEMBER_USER_ID,
      action: "group_name_changed",
      targetKind: "group",
      targetId: homeGroupId,
      targetLabel: "matrix home",
      beforeValue: "before",
      afterValue: "after",
      createdAt: 1,
    });

    return {
      homeGroupId,
      otherGroupId,
      memberUserDocId,
      homeMemberUserDocId,
      noGroupUserDocId,
      otherUserDocId,
      homeCategoryId,
      homeSecondCategoryId,
      homeInactiveCategoryId,
      otherCategoryId,
      homeSourceDocumentId,
      otherSourceDocumentId,
      homeExpenseEntryId,
      otherExpenseEntryId,
      homeRecurringRuleId,
      otherRecurringRuleId,
      homeEntryFavoriteId,
      otherEntryFavoriteId,
      homeSavedExpenseSearchId,
      otherSavedExpenseSearchId,
      homeReceiptId,
      otherReceiptId,
      homeReadyDraftId,
      homeRegisteredDraftId,
      otherDraftId,
      homeReadyDraftItemId,
      homeRegisteredDraftItemId,
      otherDraftItemId,
      homeBatchId,
      otherBatchId,
      homeImageJobId,
      homeRetryImageJobId,
      otherImageJobId,
      homeInvitationId,
      otherInvitationId,
      homeGroupDeletionJobId,
      otherGroupDeletionJobId,
    };
  });
}

function validArgs(endpoint: string, ids: FixtureIds): Record<string, unknown> {
  const paginationOpts = { numItems: 10, cursor: null };
  const reviewItem = {
    itemId: ids.homeReadyDraftItemId,
    itemName: "item",
    lineType: "item",
    amountYen: 100,
    categoryId: ids.homeCategoryId,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
  };
  const registeredItem = { ...reviewItem, itemId: ids.homeRegisteredDraftItemId };
  const args: Record<string, Record<string, unknown>> = {
    "aiExpenseDrafts/mutations:applyReceiptTaxSettings": {
      draftId: ids.homeReadyDraftId,
      taxRatePercent: 10,
      amountBasis: "tax_included",
    },
    "aiExpenseDrafts/mutations:deleteDraft": { draftId: ids.homeReadyDraftId },
    "aiExpenseDrafts/mutations:registerReadyDraftsAsExpenseEntries": {
      draftIds: [ids.homeReadyDraftId],
    },
    "aiExpenseDrafts/mutations:resetReceiptToAiInterpretation": { draftId: ids.homeReadyDraftId },
    "aiExpenseDrafts/mutations:updateDraftItemTaxOverrides": {
      draftId: ids.homeReadyDraftId,
      itemId: ids.homeReadyDraftItemId,
      taxRatePercent: 10,
      amountBasis: "tax_included",
    },
    "aiExpenseDrafts/mutations:updateForReview": {
      draftId: ids.homeReadyDraftId,
      documentType: "receipt",
      shopName: "shop",
      date: "2026-01-01",
      amountYen: 100,
      registrationMode: "totalOnly",
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      categoryId: ids.homeCategoryId,
      items: [reviewItem],
    },
    "aiExpenseDrafts/mutations:updateRegisteredDraft": {
      draftId: ids.homeRegisteredDraftId,
      date: "2026-01-01",
      amountYen: 100,
      categoryId: ids.homeCategoryId,
      shopName: "shop",
      registrationMode: "totalOnly",
      items: [registeredItem],
    },
    "aiExpenseDrafts/queries:getWithItems": { draftId: ids.homeReadyDraftId },
    "aiExpenseDrafts/queries:listByStatus": { status: "ready" },
    "aiExpenseDrafts/queries:listByStatusPaginated": { status: "ready", paginationOpts },
    "categories/mutations:createCategory": { name: "new category", color: "#123456" },
    "categories/mutations:deactivateCategory": { categoryId: ids.homeCategoryId },
    "categories/mutations:moveCategory": { categoryId: ids.homeSecondCategoryId, direction: "up" },
    "categories/mutations:reactivateCategory": { categoryId: ids.homeInactiveCategoryId },
    "categories/mutations:seedDefaultCategories": {},
    "categories/mutations:updateCategory": {
      categoryId: ids.homeCategoryId,
      name: "updated category",
      color: "#123456",
    },
    "categories/queries:listActive": {},
    "categories/queries:listForSettings": {},
    "dataExport:listExportEntries": {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      entryType: "expense",
    },
    "entryFavorites/mutations:deleteEntryFavorite": { entryFavoriteId: ids.homeEntryFavoriteId },
    "entryFavorites/mutations:saveEntryFavorite": {
      title: "favorite",
      categoryId: ids.homeCategoryId,
      amountYen: 100,
    },
    "entryFavorites/queries:listEntryFavorites": {},
    "expenseEntries/mutations:bulkDeleteSpendingRecords": {
      expenseEntryIds: [ids.homeExpenseEntryId],
      receiptIds: [ids.homeReceiptId],
    },
    "expenseEntries/mutations:bulkUpdateSpendingCategories": {
      expenseEntryIds: [ids.homeExpenseEntryId],
      receiptIds: [ids.homeReceiptId],
      categoryId: ids.homeCategoryId,
    },
    "expenseEntries/mutations:createExpenseEntries": {
      date: "2026-01-01",
      shopName: "shop",
      sourceAmountYen: 100,
      sourceDocumentId: ids.homeSourceDocumentId,
      items: [{ categoryId: ids.homeCategoryId, amountYen: 100, title: "item" }],
    },
    "expenseEntries/mutations:createIncomeEntry": {
      date: "2026-01-01",
      amountYen: 100,
      title: "income",
    },
    "expenseEntries/mutations:deleteExpenseEntry": { expenseEntryId: ids.homeExpenseEntryId },
    "expenseEntries/mutations:updateExpenseEntry": {
      expenseEntryId: ids.homeExpenseEntryId,
      date: "2026-01-02",
      amountYen: 120,
      categoryId: ids.homeCategoryId,
      title: "updated expense",
    },
    "expenseSearch:searchExpenses": { paginationOpts },
    "groups/auditLogs:listManagementAuditLogs": {},
    "groups/clerkInvitations:cancelPendingGroupInvitation": { invitationId: ids.homeInvitationId },
    "groups/clerkInvitations:inviteMember": {
      email: "new-member@example.test",
      redirectUrl: "http://localhost:5173/group/invitations/accept",
    },
    "groups/deletion:getGroupDeletionPreview": {},
    "groups/deletion:getGroupDeletionStatus": { jobId: ids.homeGroupDeletionJobId },
    "groups/deletion:requestGroupDeletion": {
      confirmationGroupName: "matrix home",
    },
    "groups/deletion:resumeGroupDeletion": { jobId: ids.homeGroupDeletionJobId },
    "groups/members:changeMemberRole": { targetUserId: HOME_MEMBER_USER_ID, newRole: "owner" },
    "groups/members:removeMember": { targetUserId: HOME_MEMBER_USER_ID },
    "groups/members:transferGroupOwnership": { targetUserId: HOME_MEMBER_USER_ID },
    "groups/mutations:setActiveGroup": { groupId: ids.homeGroupId },
    "groups/mutations:setMonthlyBudget": { monthlyBudgetYen: 10000 },
    "groups/mutations:updateGroupName": { name: "matrix home updated" },
    "groups/queries:getGroupMembers": {},
    "groups/queries:getMyGroup": {},
    "groups/queries:listMyGroups": {},
    "groups/queries:listPendingGroupInvitations": {},
    "receiptAnalysisJobs/actions:analyzeImageJob": {
      jobId: ids.homeImageJobId,
      imageDataUrl: VALID_IMAGE_DATA_URL,
    },
    "receiptAnalysisJobs/mutations:cancelImageJob": { jobId: ids.homeImageJobId },
    "receiptAnalysisJobs/mutations:createBatch": { fileNames: ["receipt.jpg"] },
    "receiptAnalysisJobs/mutations:retryImageJob": { jobId: ids.homeRetryImageJobId },
    "receiptAnalysisJobs/queries:listActiveJobs": {},
    "receiptAnalysisJobs/queries:listJobsByBatch": { batchId: ids.homeBatchId },
    "receiptAnalysisJobs/queries:listJobsByDraftIds": { draftIds: [ids.homeReadyDraftId] },
    "receipts/crud:deleteReceipt": { receiptId: ids.homeReceiptId },
    "receipts/crud:updateReceipt": {
      receiptId: ids.homeReceiptId,
      date: "2026-01-02",
      shopName: "updated shop",
      amountYen: 120,
      categoryId: ids.homeCategoryId,
    },
    "receipts/summaries:getFourWeeksSummary": { weekStartDate: "2025-12-29" },
    "receipts/summaries:getMonthSummaryWithCategories": { month: "2026-01" },
    "receipts/summaries:getWeekSummary": { weekStartDate: "2025-12-29" },
    "receipts/summaries:getWeekSummaryWithCategories": { weekStartDate: "2025-12-29" },
    "receipts/summaries:getYearSummary": { year: "2026" },
    "recurringRules/index:createRecurringRule": {
      kind: "expense",
      title: "recurring",
      amountYen: 100,
      categoryId: ids.homeCategoryId,
      frequency: "weekly",
      dayOfWeek: 1,
    },
    "recurringRules/index:listRecurringRules": {},
    "recurringRules/index:registerFromRecurringRule": { ruleId: ids.homeRecurringRuleId },
    "recurringRules/index:setRecurringRuleActive": {
      ruleId: ids.homeRecurringRuleId,
      active: false,
    },
    "recurringRules/index:updateRecurringRule": {
      ruleId: ids.homeRecurringRuleId,
      kind: "expense",
      title: "updated recurring",
      amountYen: 120,
      categoryId: ids.homeCategoryId,
      frequency: "weekly",
      dayOfWeek: 1,
    },
    "savedExpenseSearches/mutations:deleteSavedExpenseSearch": {
      savedExpenseSearchId: ids.homeSavedExpenseSearchId,
    },
    "savedExpenseSearches/mutations:recordRecentExpenseSearch": { query: "recent" },
    "savedExpenseSearches/mutations:saveExpenseSearch": { name: "saved", query: "query" },
    "savedExpenseSearches/queries:listSavedExpenseSearches": {},
    "weekSessions/mutations:getOrCreateCurrentWeekSession": {},
    "weekSessions/mutations:getOrCreateWeekSession": { weekStartDate: "2026-01-05" },
  };
  const result = args[endpoint];
  if (result === undefined) throw new Error(`missing valid args: ${endpoint}`);
  return result;
}

function replacementIds(ids: FixtureIds): Map<string, string> {
  return new Map([
    [ids.homeGroupId, ids.otherGroupId],
    [ids.homeCategoryId, ids.otherCategoryId],
    [ids.homeSecondCategoryId, ids.otherCategoryId],
    [ids.homeInactiveCategoryId, ids.otherCategoryId],
    [ids.homeSourceDocumentId, ids.otherSourceDocumentId],
    [ids.homeExpenseEntryId, ids.otherExpenseEntryId],
    [ids.homeRecurringRuleId, ids.otherRecurringRuleId],
    [ids.homeEntryFavoriteId, ids.otherEntryFavoriteId],
    [ids.homeSavedExpenseSearchId, ids.otherSavedExpenseSearchId],
    [ids.homeReceiptId, ids.otherReceiptId],
    [ids.homeReadyDraftId, ids.otherDraftId],
    [ids.homeRegisteredDraftId, ids.otherDraftId],
    [ids.homeReadyDraftItemId, ids.otherDraftItemId],
    [ids.homeRegisteredDraftItemId, ids.otherDraftItemId],
    [ids.homeBatchId, ids.otherBatchId],
    [ids.homeImageJobId, ids.otherImageJobId],
    [ids.homeRetryImageJobId, ids.otherImageJobId],
    [ids.homeInvitationId, ids.otherInvitationId],
    [ids.homeGroupDeletionJobId, ids.otherGroupDeletionJobId],
  ]);
}

function replaceIds(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceIds(item, replacements));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceIds(item, replacements),
      ]),
    );
  }
  return value;
}

function homeIdSet(ids: FixtureIds): Set<string> {
  return new Set(replacementIds(ids).keys());
}

function includesHomeId(value: unknown, homeIds: Set<string>): boolean {
  if (typeof value === "string") return homeIds.has(value);
  if (Array.isArray(value)) return value.some((item) => includesHomeId(item, homeIds));
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      includesHomeId(item, homeIds),
    );
  }
  return false;
}

function otherGroupArgs(args: Record<string, unknown>, ids: FixtureIds) {
  return replaceIds(args, replacementIds(ids)) as Record<string, unknown>;
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

function reference(endpoint: string, kind: Kind) {
  if (kind === "mutation")
    return makeFunctionReference<"mutation", Record<string, unknown>, unknown>(endpoint);
  if (kind === "action")
    return makeFunctionReference<"action", Record<string, unknown>, unknown>(endpoint);
  return makeFunctionReference<"query", Record<string, unknown>, unknown>(endpoint);
}

function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.every(isEmptyResult);
  if (typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && record.deleted === false) return true;
  return Object.values(record).every(isEmptyResult);
}

async function tableSnapshot(t: TestT) {
  const rows = await Promise.all(
    Object.keys(schema.tables).map(async (table) => [
      table,
      await t.run(async (ctx) => await ctx.db.query(table as never).collect()),
    ]),
  );
  return Object.fromEntries(rows) as Record<string, unknown[]>;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>))
      collectStrings(item, output);
  }
  return output;
}

function collectComparablePrimitives(value: unknown, output: Array<string | number> = []) {
  if (typeof value === "string" || typeof value === "number") output.push(value);
  else if (Array.isArray(value))
    for (const item of value) collectComparablePrimitives(item, output);
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>))
      collectComparablePrimitives(item, output);
  }
  return output;
}

function expectNoOtherGroupSeed(value: unknown, ids: FixtureIds, endpoint: string) {
  const strings = collectStrings(value);
  const leaked = strings.filter((item) => new Set(replacementIds(ids).values()).has(item));
  expect(leaked, `${endpoint} returned other-group seed ids`).toEqual([]);
}

function changedDocuments(
  before: Record<string, unknown[]>,
  after: Record<string, unknown[]>,
): unknown[] {
  const changed: unknown[] = [];
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const beforeText = new Set((before[table] ?? []).map((doc) => JSON.stringify(doc)));
    const afterText = new Set((after[table] ?? []).map((doc) => JSON.stringify(doc)));
    for (const doc of after[table] ?? []) {
      if (!beforeText.has(JSON.stringify(doc))) changed.push(doc);
    }
    for (const doc of before[table] ?? []) {
      if (!afterText.has(JSON.stringify(doc))) changed.push(doc);
    }
  }
  return changed;
}

function rejectionText(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function isBoundaryRejection(error: unknown): boolean {
  const text = rejectionText(error);
  if (/argument validation|validator validation|value validation/i.test(text)) return false;
  return [
    /not authenticated/i,
    /認証/,
    /ログイン/,
    /グループに所属していません/,
    /グループを選択してください/,
    /権限/,
    /オーナー/,
    /owner/i,
    /not found/i,
    /見つかりません/,
    /削除ジョブが見つかりません/,
    /does not belong to the current (group|draft)/i,
    /現在選択中のグループでのみ実行できます/,
    /利用グループが変更されました/,
  ].some((pattern) => pattern.test(text));
}

async function expectRejected(
  t: TestT,
  row: PublicRow,
  args: Record<string, unknown>,
  caller: Pick<TestT, Kind>,
) {
  const before = row.kind === "query" ? null : await tableSnapshot(t);
  let value: unknown;
  let resolved = false;
  let boundaryRejected = false;
  let caught: unknown;
  try {
    value = await caller[row.kind](reference(row.endpoint, row.kind) as never, args);
    resolved = true;
  } catch (error) {
    caught = error;
    boundaryRejected = isBoundaryRejection(error);
  }
  if (!resolved) {
    expect(
      boundaryRejected,
      `${row.endpoint} rejected with a non-boundary error: ${rejectionText(caught)}`,
    ).toBe(true);
  }
  if (resolved)
    expect(
      isEmptyResult(value),
      `${row.endpoint} resolved with non-empty value: ${JSON.stringify(value)}`,
    ).toBe(true);
  if (before !== null) {
    const after = await tableSnapshot(t);
    expect(changedDocuments(before, after), `${row.endpoint} wrote to the database`).toEqual([]);
  }
}

const matrixEntries = Object.keys(HOUSEHOLD_MATRIX).map((endpoint) => ({ endpoint }));

describe("household group boundary matrix", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("RECEIPT_IMAGE_EXTRACTOR_MODE", "mock");
    vi.stubEnv("CLERK_SECRET_KEY", "test-secret");
    clerkCreateInvitation.mockReset();
    clerkCreateInvitation.mockResolvedValue({ id: "clerk-invitation-id" });
    clerkRevokeInvitation.mockReset();
    clerkRevokeInvitation.mockResolvedValue({});
    clerkGetUser.mockReset();
    clerkGetUser.mockResolvedValue({ emailAddresses: [] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("公開関数をすべて分類表に載せ、household 区分をマトリクスと positive control に入れる", async () => {
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
    for (const endpoint of Object.keys(HOUSEHOLD_MATRIX)) {
      expect(() => validArgs(endpoint, {} as FixtureIds), endpoint).not.toThrow();
    }
  }, 30_000);

  it.each(matrixEntries)("所属ユーザーは妥当な引数で $endpoint を呼べる", async ({ endpoint }) => {
    const rows = await listPublicFunctions();
    const row = rows.find((candidate) => candidate.endpoint === endpoint);
    expect(row, `missing public function: ${endpoint}`).toBeDefined();
    const t = convexTest(schema, convexTestModules);
    const ids = await seedBoundaryFixture(t);
    const args = validArgs(endpoint, ids);
    const caller = t.withIdentity(identity(MEMBER_USER_ID));
    const before = row.kind === "query" ? null : await tableSnapshot(t);
    const value = await caller[row!.kind](reference(endpoint, row!.kind) as never, args);
    expectNoOtherGroupSeed(value, ids, endpoint);
    if (row!.kind === "query") {
      expect(
        isEmptyResult(value),
        `${endpoint} returned no household seed data: ${JSON.stringify(value)}`,
      ).toBe(false);
      const resultStrings = collectStrings(value);
      const projectedSeedProofs: Record<string, boolean> = {
        "groups/auditLogs:listManagementAuditLogs": resultStrings.includes("matrix home"),
        "groups/deletion:getGroupDeletionPreview": resultStrings.includes("matrix home"),
        "groups/queries:getGroupMembers": resultStrings.includes(MEMBER_USER_ID),
        "receipts/summaries:getWeekSummary":
          (value as { totalAmountYen?: number; count?: number }).totalAmountYen === 100 &&
          (value as { totalAmountYen?: number; count?: number }).count === 1,
      };
      const hasOwnSeedProof =
        projectedSeedProofs[endpoint] ?? resultStrings.some((item) => homeIdSet(ids).has(item));
      expect(
        hasOwnSeedProof,
        `${endpoint} did not return own-group seed data: ${JSON.stringify(value)}`,
      ).toBe(true);
    } else if (before !== null) {
      const after = await tableSnapshot(t);
      const changed = changedDocuments(before, after);
      expect(changed, `${endpoint} did not create or update a record`).not.toEqual([]);
      expectNoOtherGroupSeed(changed, ids, endpoint);
      const changedText = JSON.stringify(changed);
      const argumentPrimitives = collectComparablePrimitives(args).filter(
        (item) => typeof item === "number" || item.length > 0,
      );
      const fixturePrimitives: Array<string | number> = [
        ids.homeGroupId,
        MEMBER_USER_ID,
        HOME_MEMBER_USER_ID,
      ];
      const expectedValues = [...argumentPrimitives, ...fixturePrimitives];
      expect(
        expectedValues.some((item) => changedText.includes(String(item))),
        `${endpoint} changed records do not contain an expected argument or own-group value`,
      ).toBe(true);
    }
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
        const args = validArgs(endpoint, ids);
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
      const t = convexTest(schema, convexTestModules);
      const ids = await seedBoundaryFixture(t);
      const ownArgs = validArgs(endpoint, ids);
      if (!containsId(row!.argsValidator) || !includesHomeId(ownArgs, homeIdSet(ids))) return;
      const args = otherGroupArgs(ownArgs, ids);
      const memberCaller = t.withIdentity(identity(MEMBER_USER_ID));
      await expectRejected(t, row!, args, memberCaller);
      for (const [homeId, otherId] of replacementIds(ids)) {
        if (!collectStrings(ownArgs).includes(homeId)) continue;
        const individuallySwapped = replaceIds(ownArgs, new Map([[homeId, otherId]])) as Record<
          string,
          unknown
        >;
        await expectRejected(t, row!, individuallySwapped, memberCaller);
      }
    },
  );

  it.each([
    "groups/members:changeMemberRole",
    "groups/members:removeMember",
    "groups/members:transferGroupOwnership",
  ])("別グループの対象ユーザー ID は %s で受け入れない", async (endpoint) => {
    const rows = await listPublicFunctions();
    const row = rows.find((candidate) => candidate.endpoint === endpoint);
    expect(row, `missing public function: ${endpoint}`).toBeDefined();
    const t = convexTest(schema, convexTestModules);
    const ids = await seedBoundaryFixture(t);
    const args = { ...validArgs(endpoint, ids), targetUserId: OTHER_MEMBER_USER_ID };
    await expectRejected(t, row!, args, t.withIdentity(identity(MEMBER_USER_ID)));
  });
});
