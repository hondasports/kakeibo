import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requestGroupDeletionHandler } from "./deletion";

export const confirmGroupRemoval = mutation({
  args: {
    expectedGroupId: v.id("groups"),
    confirmationGroupName: v.string(),
  },
  returns: v.id("groupDeletionJobs"),
  handler: requestGroupDeletionHandler,
});
