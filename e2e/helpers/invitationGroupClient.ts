import { expect, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { invitationGroupOperations } from "./invitationGroups";

export async function invitationGroupOperationsForPage(page: Page, actorUserId: string) {
  const configuredActor = process.env.E2E_CLERK_USER_ID?.trim().replace(/^['"]+|['"]+$/g, "");
  if (!configuredActor || actorUserId !== configuredActor)
    throw new Error("Invitation E2E actor is not configured");
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set");
  const client = new ConvexHttpClient(convexUrl);
  const refreshAuth = async () => {
    const getToken = (template?: string) =>
      page.evaluate(async (tokenTemplate) => {
        const clerk = (
          window as Window & {
            Clerk?: {
              session?: {
                getToken: (options: {
                  skipCache: boolean;
                  template?: string;
                }) => Promise<string | null>;
              };
            };
          }
        ).Clerk;
        return await clerk?.session?.getToken({
          skipCache: true,
          ...(tokenTemplate ? { template: tokenTemplate } : {}),
        });
      }, template);
    const sessionToken = await getToken();
    if (!sessionToken) throw new Error("Invitation E2E session is not available");
    const claims = JSON.parse(
      Buffer.from(sessionToken.split(".")[1], "base64url").toString("utf8"),
    ) as { aud?: string };
    const token = claims.aud === "convex" ? sessionToken : await getToken("convex");
    if (!token) throw new Error("Invitation E2E Convex authentication is not available");
    client.setAuth(token);
  };
  const operations = invitationGroupOperations(client, async (jobId) => {
    await expect
      .poll(
        async () => {
          await refreshAuth();
          const status = await client.query(api.groups.deletion.getGroupDeletionStatus, { jobId });
          if (!status) throw new Error("Invitation E2E deletion status is not available");
          return status.status;
        },
        { timeout: 60_000, intervals: [250, 500, 1000] },
      )
      .toMatch(/^(completed|failed)$/);
    const status = await client.query(api.groups.deletion.getGroupDeletionStatus, { jobId });
    expect(status?.status).toBe("completed");
  });
  const getActor = operations.getActor;
  operations.getActor = async () => {
    await refreshAuth();
    return await getActor();
  };
  return operations;
}
