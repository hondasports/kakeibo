/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as accountDeletionActions from "../accountDeletionActions.js";
import type * as aiExpenseDrafts_actions from "../aiExpenseDrafts/actions.js";
import type * as aiExpenseDrafts_e2eDraftFixtures from "../aiExpenseDrafts/e2eDraftFixtures.js";
import type * as aiExpenseDrafts_internal from "../aiExpenseDrafts/internal.js";
import type * as aiExpenseDrafts_model from "../aiExpenseDrafts/model.js";
import type * as aiExpenseDrafts_mutations from "../aiExpenseDrafts/mutations.js";
import type * as aiExpenseDrafts_queries from "../aiExpenseDrafts/queries.js";
import type * as aiExpenseDrafts_validators from "../aiExpenseDrafts/validators.js";
import type * as categories_candidate from "../categories/candidate.js";
import type * as categories_internal from "../categories/internal.js";
import type * as categories_mutations from "../categories/mutations.js";
import type * as categories_normalize from "../categories/normalize.js";
import type * as categories_queries from "../categories/queries.js";
import type * as crons from "../crons.js";
import type * as e2eHttp_e2eAuth from "../e2eHttp/e2eAuth.js";
import type * as e2eHttp_e2eCleanup from "../e2eHttp/e2eCleanup.js";
import type * as e2eHttp_e2eSeedDraft from "../e2eHttp/e2eSeedDraft.js";
import type * as e2eHttp_e2eSystemAdminMembership from "../e2eHttp/e2eSystemAdminMembership.js";
import type * as e2eHttp_e2eSystemAdminSearch from "../e2eHttp/e2eSystemAdminSearch.js";
import type * as email_actions from "../email/actions.js";
import type * as email_cleanup from "../email/cleanup.js";
import type * as email_internal from "../email/internal.js";
import type * as email_jobs from "../email/jobs.js";
import type * as email_lib_providers from "../email/lib/providers.js";
import type * as email_model from "../email/model.js";
import type * as email_suppressions from "../email/suppressions.js";
import type * as email_webhooks_processResendEvent from "../email/webhooks/processResendEvent.js";
import type * as email_webhooks_resendWebhook from "../email/webhooks/resendWebhook.js";
import type * as expenseEntries_internal from "../expenseEntries/internal.js";
import type * as expenseEntries_mutations from "../expenseEntries/mutations.js";
import type * as expenseSearch from "../expenseSearch.js";
import type * as groups_adminGuards from "../groups/adminGuards.js";
import type * as groups_auditLogs from "../groups/auditLogs.js";
import type * as groups_clerkInvitations from "../groups/clerkInvitations.js";
import type * as groups_deletion from "../groups/deletion.js";
import type * as groups_e2e from "../groups/e2e.js";
import type * as groups_groupDeletion from "../groups/groupDeletion.js";
import type * as groups_invitations from "../groups/invitations.js";
import type * as groups_lib_deleteGroupPhysically from "../groups/lib/deleteGroupPhysically.js";
import type * as groups_lib_emailNotifications from "../groups/lib/emailNotifications.js";
import type * as groups_lib_groupDeletionBatchProcessor from "../groups/lib/groupDeletionBatchProcessor.js";
import type * as groups_lib_groupDeletionBatchRetry from "../groups/lib/groupDeletionBatchRetry.js";
import type * as groups_lib_groupDeletionConstants from "../groups/lib/groupDeletionConstants.js";
import type * as groups_lib_groupDeletionFailureNotification from "../groups/lib/groupDeletionFailureNotification.js";
import type * as groups_lib_groupDeletionImpact from "../groups/lib/groupDeletionImpact.js";
import type * as groups_lib_groupDeletionJobModel from "../groups/lib/groupDeletionJobModel.js";
import type * as groups_lib_groupDeletionRecipientNotifications from "../groups/lib/groupDeletionRecipientNotifications.js";
import type * as groups_lib_groupDeletionRegistry from "../groups/lib/groupDeletionRegistry.js";
import type * as groups_lib_groupDeletionResume from "../groups/lib/groupDeletionResume.js";
import type * as groups_lib_groupDeletionRetry from "../groups/lib/groupDeletionRetry.js";
import type * as groups_lib_groupDeletionScheduling from "../groups/lib/groupDeletionScheduling.js";
import type * as groups_lib_groupDeletionStagePurge from "../groups/lib/groupDeletionStagePurge.js";
import type * as groups_lib_groupDeletionStart from "../groups/lib/groupDeletionStart.js";
import type * as groups_lib_groupDeletionTypes from "../groups/lib/groupDeletionTypes.js";
import type * as groups_lib_groupEmailMatching from "../groups/lib/groupEmailMatching.js";
import type * as groups_lib_groupLifecycle from "../groups/lib/groupLifecycle.js";
import type * as groups_lib_groupName from "../groups/lib/groupName.js";
import type * as groups_lib_groupQueryHelpers from "../groups/lib/groupQueryHelpers.js";
import type * as groups_lib_groupRoleLabel from "../groups/lib/groupRoleLabel.js";
import type * as groups_lib_groupTypes from "../groups/lib/groupTypes.js";
import type * as groups_lib_managementAuditLog from "../groups/lib/managementAuditLog.js";
import type * as groups_lib_managementAuditLogModel from "../groups/lib/managementAuditLogModel.js";
import type * as groups_memberDisplay from "../groups/memberDisplay.js";
import type * as groups_members from "../groups/members.js";
import type * as groups_membership from "../groups/membership.js";
import type * as groups_mutations from "../groups/mutations.js";
import type * as groups_queries from "../groups/queries.js";
import type * as groups_validators from "../groups/validators.js";
import type * as http from "../http.js";
import type * as legacyGroupDeletionAuditMigration from "../legacyGroupDeletionAuditMigration.js";
import type * as lib_discountItems from "../lib/discountItems.js";
import type * as lib_weekDates from "../lib/weekDates.js";
import type * as lineLink_actions from "../lineLink/actions.js";
import type * as lineLink_internal from "../lineLink/internal.js";
import type * as lineLink_model from "../lineLink/model.js";
import type * as lineLink_mutations from "../lineLink/mutations.js";
import type * as lineLink_queries from "../lineLink/queries.js";
import type * as lineWebhook_actions from "../lineWebhook/actions.js";
import type * as lineWebhook_cleanup from "../lineWebhook/cleanup.js";
import type * as lineWebhook_client from "../lineWebhook/client.js";
import type * as lineWebhook_image from "../lineWebhook/image.js";
import type * as lineWebhook_internal from "../lineWebhook/internal.js";
import type * as lineWebhook_model from "../lineWebhook/model.js";
import type * as lineWebhook_richMenuClient from "../lineWebhook/richMenuClient.js";
import type * as lineWebhook_signature from "../lineWebhook/signature.js";
import type * as lineWebhook_summary from "../lineWebhook/summary.js";
import type * as lineWebhook_webhook from "../lineWebhook/webhook.js";
import type * as receiptAnalysisJobs_actions from "../receiptAnalysisJobs/actions.js";
import type * as receiptAnalysisJobs_internal from "../receiptAnalysisJobs/internal.js";
import type * as receiptAnalysisJobs_mutations from "../receiptAnalysisJobs/mutations.js";
import type * as receiptAnalysisJobs_queries from "../receiptAnalysisJobs/queries.js";
import type * as receiptImageExtraction_extraction from "../receiptImageExtraction/extraction.js";
import type * as receipts_crud from "../receipts/crud.js";
import type * as receipts_mutations from "../receipts/mutations.js";
import type * as receipts_spendingEntries from "../receipts/spendingEntries.js";
import type * as receipts_summaries from "../receipts/summaries.js";
import type * as systemAdminGroupDeletion from "../systemAdminGroupDeletion.js";
import type * as systemAdminMembership from "../systemAdminMembership.js";
import type * as systemAdminOwnerlessGroupRecovery from "../systemAdminOwnerlessGroupRecovery.js";
import type * as systemAdminPendingInvitation from "../systemAdminPendingInvitation.js";
import type * as systemAdminPendingInvitationAction from "../systemAdminPendingInvitationAction.js";
import type * as systemAdminRoleOperations from "../systemAdminRoleOperations.js";
import type * as systemAdminSearch from "../systemAdminSearch.js";
import type * as systemAdmins from "../systemAdmins.js";
import type * as users_auth from "../users/auth.js";
import type * as users_internal from "../users/internal.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";
import type * as users_weeklySettings from "../users/weeklySettings.js";
import type * as weekSessions_internal from "../weekSessions/internal.js";
import type * as weekSessions_mutations from "../weekSessions/mutations.js";
import type * as weekSessions_queries from "../weekSessions/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  accountDeletionActions: typeof accountDeletionActions;
  "aiExpenseDrafts/actions": typeof aiExpenseDrafts_actions;
  "aiExpenseDrafts/e2eDraftFixtures": typeof aiExpenseDrafts_e2eDraftFixtures;
  "aiExpenseDrafts/internal": typeof aiExpenseDrafts_internal;
  "aiExpenseDrafts/model": typeof aiExpenseDrafts_model;
  "aiExpenseDrafts/mutations": typeof aiExpenseDrafts_mutations;
  "aiExpenseDrafts/queries": typeof aiExpenseDrafts_queries;
  "aiExpenseDrafts/validators": typeof aiExpenseDrafts_validators;
  "categories/candidate": typeof categories_candidate;
  "categories/internal": typeof categories_internal;
  "categories/mutations": typeof categories_mutations;
  "categories/normalize": typeof categories_normalize;
  "categories/queries": typeof categories_queries;
  crons: typeof crons;
  "e2eHttp/e2eAuth": typeof e2eHttp_e2eAuth;
  "e2eHttp/e2eCleanup": typeof e2eHttp_e2eCleanup;
  "e2eHttp/e2eSeedDraft": typeof e2eHttp_e2eSeedDraft;
  "e2eHttp/e2eSystemAdminMembership": typeof e2eHttp_e2eSystemAdminMembership;
  "e2eHttp/e2eSystemAdminSearch": typeof e2eHttp_e2eSystemAdminSearch;
  "email/actions": typeof email_actions;
  "email/cleanup": typeof email_cleanup;
  "email/internal": typeof email_internal;
  "email/jobs": typeof email_jobs;
  "email/lib/providers": typeof email_lib_providers;
  "email/model": typeof email_model;
  "email/suppressions": typeof email_suppressions;
  "email/webhooks/processResendEvent": typeof email_webhooks_processResendEvent;
  "email/webhooks/resendWebhook": typeof email_webhooks_resendWebhook;
  "expenseEntries/internal": typeof expenseEntries_internal;
  "expenseEntries/mutations": typeof expenseEntries_mutations;
  expenseSearch: typeof expenseSearch;
  "groups/adminGuards": typeof groups_adminGuards;
  "groups/auditLogs": typeof groups_auditLogs;
  "groups/clerkInvitations": typeof groups_clerkInvitations;
  "groups/deletion": typeof groups_deletion;
  "groups/e2e": typeof groups_e2e;
  "groups/groupDeletion": typeof groups_groupDeletion;
  "groups/invitations": typeof groups_invitations;
  "groups/lib/deleteGroupPhysically": typeof groups_lib_deleteGroupPhysically;
  "groups/lib/emailNotifications": typeof groups_lib_emailNotifications;
  "groups/lib/groupDeletionBatchProcessor": typeof groups_lib_groupDeletionBatchProcessor;
  "groups/lib/groupDeletionBatchRetry": typeof groups_lib_groupDeletionBatchRetry;
  "groups/lib/groupDeletionConstants": typeof groups_lib_groupDeletionConstants;
  "groups/lib/groupDeletionFailureNotification": typeof groups_lib_groupDeletionFailureNotification;
  "groups/lib/groupDeletionImpact": typeof groups_lib_groupDeletionImpact;
  "groups/lib/groupDeletionJobModel": typeof groups_lib_groupDeletionJobModel;
  "groups/lib/groupDeletionRecipientNotifications": typeof groups_lib_groupDeletionRecipientNotifications;
  "groups/lib/groupDeletionRegistry": typeof groups_lib_groupDeletionRegistry;
  "groups/lib/groupDeletionResume": typeof groups_lib_groupDeletionResume;
  "groups/lib/groupDeletionRetry": typeof groups_lib_groupDeletionRetry;
  "groups/lib/groupDeletionScheduling": typeof groups_lib_groupDeletionScheduling;
  "groups/lib/groupDeletionStagePurge": typeof groups_lib_groupDeletionStagePurge;
  "groups/lib/groupDeletionStart": typeof groups_lib_groupDeletionStart;
  "groups/lib/groupDeletionTypes": typeof groups_lib_groupDeletionTypes;
  "groups/lib/groupEmailMatching": typeof groups_lib_groupEmailMatching;
  "groups/lib/groupLifecycle": typeof groups_lib_groupLifecycle;
  "groups/lib/groupName": typeof groups_lib_groupName;
  "groups/lib/groupQueryHelpers": typeof groups_lib_groupQueryHelpers;
  "groups/lib/groupRoleLabel": typeof groups_lib_groupRoleLabel;
  "groups/lib/groupTypes": typeof groups_lib_groupTypes;
  "groups/lib/managementAuditLog": typeof groups_lib_managementAuditLog;
  "groups/lib/managementAuditLogModel": typeof groups_lib_managementAuditLogModel;
  "groups/memberDisplay": typeof groups_memberDisplay;
  "groups/members": typeof groups_members;
  "groups/membership": typeof groups_membership;
  "groups/mutations": typeof groups_mutations;
  "groups/queries": typeof groups_queries;
  "groups/validators": typeof groups_validators;
  http: typeof http;
  legacyGroupDeletionAuditMigration: typeof legacyGroupDeletionAuditMigration;
  "lib/discountItems": typeof lib_discountItems;
  "lib/weekDates": typeof lib_weekDates;
  "lineLink/actions": typeof lineLink_actions;
  "lineLink/internal": typeof lineLink_internal;
  "lineLink/model": typeof lineLink_model;
  "lineLink/mutations": typeof lineLink_mutations;
  "lineLink/queries": typeof lineLink_queries;
  "lineWebhook/actions": typeof lineWebhook_actions;
  "lineWebhook/cleanup": typeof lineWebhook_cleanup;
  "lineWebhook/client": typeof lineWebhook_client;
  "lineWebhook/image": typeof lineWebhook_image;
  "lineWebhook/internal": typeof lineWebhook_internal;
  "lineWebhook/model": typeof lineWebhook_model;
  "lineWebhook/richMenuClient": typeof lineWebhook_richMenuClient;
  "lineWebhook/signature": typeof lineWebhook_signature;
  "lineWebhook/summary": typeof lineWebhook_summary;
  "lineWebhook/webhook": typeof lineWebhook_webhook;
  "receiptAnalysisJobs/actions": typeof receiptAnalysisJobs_actions;
  "receiptAnalysisJobs/internal": typeof receiptAnalysisJobs_internal;
  "receiptAnalysisJobs/mutations": typeof receiptAnalysisJobs_mutations;
  "receiptAnalysisJobs/queries": typeof receiptAnalysisJobs_queries;
  "receiptImageExtraction/extraction": typeof receiptImageExtraction_extraction;
  "receipts/crud": typeof receipts_crud;
  "receipts/mutations": typeof receipts_mutations;
  "receipts/spendingEntries": typeof receipts_spendingEntries;
  "receipts/summaries": typeof receipts_summaries;
  systemAdminGroupDeletion: typeof systemAdminGroupDeletion;
  systemAdminMembership: typeof systemAdminMembership;
  systemAdminOwnerlessGroupRecovery: typeof systemAdminOwnerlessGroupRecovery;
  systemAdminPendingInvitation: typeof systemAdminPendingInvitation;
  systemAdminPendingInvitationAction: typeof systemAdminPendingInvitationAction;
  systemAdminRoleOperations: typeof systemAdminRoleOperations;
  systemAdminSearch: typeof systemAdminSearch;
  systemAdmins: typeof systemAdmins;
  "users/auth": typeof users_auth;
  "users/internal": typeof users_internal;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
  "users/weeklySettings": typeof users_weeklySettings;
  "weekSessions/internal": typeof weekSessions_internal;
  "weekSessions/mutations": typeof weekSessions_mutations;
  "weekSessions/queries": typeof weekSessions_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
