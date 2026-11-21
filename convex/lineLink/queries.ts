import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuthenticatedUserId } from "../users/auth";
import { createLineLinkQueryDeps } from "../../lib/convex/lineLink/lineLinkDeps";
import { LINE_LINK_VIEW_STATUSES } from "../../lib/domain/lineLink/records";
import { getLineLinkStatus } from "../../lib/usecase/lineLink/statusAndUnlink";

const [statusUnlinked, statusMultiple, statusLinked] = LINE_LINK_VIEW_STATUSES;

export const getStatus = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal(statusUnlinked) }),
    v.object({ status: v.literal(statusMultiple) }),
    v.object({ status: v.literal(statusLinked), linkedAt: v.number() }),
  ),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return getLineLinkStatus(createLineLinkQueryDeps(ctx).accountLinks, userId);
  },
});
