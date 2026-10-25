import type { Id } from "../../convex/_generated/dataModel";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

type Group = { _id: Id<"groups">; name: string; role: "owner" | "member" };
export type InvitationGroupOperations = {
  getActor: () => Promise<string>;
  getCurrentGroup: () => Promise<Group | null>;
  createGroup: (name: string) => Promise<Id<"groups">>;
  selectGroup: (groupId: Id<"groups">) => Promise<unknown>;
  requestDeletion: (
    name: string,
    expectedGroupId: Id<"groups">,
  ) => Promise<Id<"groupDeletionJobs">>;
  waitForDeletion: (jobId: Id<"groupDeletionJobs">) => Promise<void>;
};

export function invitationGroupOperations(
  client: Pick<ConvexHttpClient, "query" | "mutation">,
  waitForDeletion: InvitationGroupOperations["waitForDeletion"],
): InvitationGroupOperations {
  return {
    getActor: () => client.query(api.users.queries.getAuthenticatedUserId, {}),
    getCurrentGroup: () => client.query(api.groups.queries.getMyGroup, {}),
    createGroup: (name) => client.mutation(api.groups.mutations.createGroup, { name }),
    selectGroup: (groupId) => client.mutation(api.groups.mutations.setActiveGroup, { groupId }),
    requestDeletion: (confirmationGroupName, expectedGroupId) =>
      client.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName,
        expectedGroupId,
      }),
    waitForDeletion,
  };
}

export async function withInvitationTestGroups<T>(
  operations: InvitationGroupOperations,
  actorUserId: string,
  run: (createGroup: (name: string) => Promise<Id<"groups">>) => Promise<T>,
): Promise<T> {
  const assertActor = async () => {
    if ((await operations.getActor()) !== actorUserId)
      throw new Error("Invitation E2E actor changed");
  };
  await assertActor();
  const originalGroup = await operations.getCurrentGroup();
  const created: { groupId: Id<"groups">; name: string }[] = [];
  const failures: unknown[] = [];
  let creationAttempts = 0;
  let result: T;
  try {
    result = await run(async (name) => {
      if (creationAttempts >= 2) throw new Error("Invitation E2E creates at most two groups");
      creationAttempts += 1;
      await assertActor();
      const groupId = await operations.createGroup(name);
      created.push({ groupId, name });
      return groupId;
    });
  } catch (error) {
    failures.push(error);
  }
  for (const { groupId, name } of created.reverse()) {
    try {
      await assertActor();
      await operations.selectGroup(groupId);
      const group = await operations.getCurrentGroup();
      if (group?._id !== groupId || group.name !== name || group.role !== "owner") {
        throw new Error("Invitation E2E cleanup target does not match the created group");
      }
      const jobId = await operations.requestDeletion(name, groupId);
      await operations.waitForDeletion(jobId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (originalGroup && created.length > 0) {
    try {
      await assertActor();
      await operations.selectGroup(originalGroup._id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Invitation E2E and cleanup failures");
  return result!;
}
