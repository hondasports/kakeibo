import { e2eSeedUnallocatedTaxDraftHandler } from "./e2eHttp/e2eSeedDraft";
import { httpRouter } from "convex/server";
import { resendWebhookHandler } from "./email/webhooks/resendWebhook";
import { lineWebhookHandler } from "./lineWebhook/webhook";
import { e2eCleanupHandler } from "./e2eHttp/e2eCleanup";
import { e2eCleanupAuthCheckHandler } from "./e2eHttp/e2eAuth";
import {
  cleanupSystemAdminMembershipHandler,
  seedSystemAdminMembershipHandler,
} from "./e2eHttp/e2eSystemAdminMembership";
import {
  cleanupSystemAdminSearchHandler,
  seedSystemAdminSearchHandler,
} from "./e2eHttp/e2eSystemAdminSearch";
import {
  e2eSeedAiExpenseDraftHandler,
  e2eSeedMixedTaxReviewDraftHandler,
  e2eSeedPendingGroupInvitationHandler,
  e2eSeedTaxReviewDraftHandler,
  e2eSeedTaxSummaryConflictDraftHandler,
} from "./e2eHttp/e2eSeedDraft";

const http = httpRouter();

// Convex determines the set of HTTP routes during deployment. Do not condition
// route registration on process.env: changing an environment variable does not
// rebuild the route table. Each E2E handler performs the APP_ENV/secret/user
// checks at request time and fails closed outside the development environment.
http.route({
  path: "/e2e/cleanup-auth-check",
  method: "POST",
  handler: e2eCleanupAuthCheckHandler,
});
http.route({
  path: "/e2e/cleanup",
  method: "POST",
  handler: e2eCleanupHandler,
});
http.route({
  path: "/e2e/seed-system-admin-membership",
  method: "POST",
  handler: seedSystemAdminMembershipHandler,
});
http.route({
  path: "/e2e/cleanup-system-admin-membership",
  method: "POST",
  handler: cleanupSystemAdminMembershipHandler,
});
http.route({
  path: "/e2e/seed-system-admin-search",
  method: "POST",
  handler: seedSystemAdminSearchHandler,
});
http.route({
  path: "/e2e/cleanup-system-admin-search",
  method: "POST",
  handler: cleanupSystemAdminSearchHandler,
});
http.route({
  path: "/e2e/seed-ai-expense-draft",
  method: "POST",
  handler: e2eSeedAiExpenseDraftHandler,
});
http.route({
  path: "/e2e/seed-tax-review-draft",
  method: "POST",
  handler: e2eSeedTaxReviewDraftHandler,
});
http.route({
  path: "/e2e/seed-mixed-tax-review-draft",
  method: "POST",
  handler: e2eSeedMixedTaxReviewDraftHandler,
});
http.route({
  path: "/e2e/seed-tax-summary-conflict-draft",
  method: "POST",
  handler: e2eSeedTaxSummaryConflictDraftHandler,
});
http.route({
  path: "/e2e/seed-pending-group-invitation",
  method: "POST",
  handler: e2eSeedPendingGroupInvitationHandler,
});
http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: resendWebhookHandler,
});
http.route({
  path: "/webhooks/line",
  method: "POST",
  handler: lineWebhookHandler,
});

http.route({
  path: "/e2e/seed-unallocated-tax-draft",
  method: "POST",
  handler: e2eSeedUnallocatedTaxDraftHandler,
});

export default http;
