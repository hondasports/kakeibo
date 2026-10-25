import { Buffer } from "node:buffer";
import { getFunctionName } from "convex/server";
import type { Page } from "@playwright/test";
import type { Id } from "../_generated/dataModel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitationGroupOperationsForPage } from "../../e2e/helpers/invitationGroupClient";

const { query, mutation, setAuth, construct } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  setAuth: vi.fn(),
  construct: vi.fn(),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: function (url: string) {
    construct(url);
    return { query, mutation, setAuth };
  },
}));
vi.mock("@playwright/test", () => ({
  expect: Object.assign(
    (actual: unknown) => ({ toBe: (expected: unknown) => expect(actual).toBe(expected) }),
    {
      poll: (read: () => Promise<unknown>) => ({
        toMatch: async (pattern: RegExp) => expect(await read()).toMatch(pattern),
      }),
    },
  ),
}));
const actor = "fixture-actor";
const fixtureToken = (aud: string) =>
  `fixture.${Buffer.from(JSON.stringify({ aud })).toString("base64url")}.signature`;
const jobId = "fixture-job" as Id<"groupDeletionJobs">;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("E2E_CLERK_USER_ID", actor);
  vi.stubEnv("VITE_CONVEX_URL", "http://127.0.0.1:3210");
  query.mockResolvedValue(actor);
});
afterEach(() => vi.unstubAllEnvs());

function pageWithTokens(...tokens: (string | null)[]) {
  const evaluate = vi.fn();
  for (const token of tokens) evaluate.mockResolvedValueOnce(token);
  return { page: { evaluate } as unknown as Page, evaluate };
}

describe("招待E2Eの認証済みownerクライアント", () => {
  it.each(["", "different-actor"])(
    "固定actor設定%sを満たさない場合は通信前に拒否する",
    async (configured) => {
      vi.stubEnv("E2E_CLERK_USER_ID", configured);
      const { page, evaluate } = pageWithTokens();
      await expect(invitationGroupOperationsForPage(page, actor)).rejects.toThrow(
        "actor is not configured",
      );
      expect(construct).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    },
  );

  it("Convex向けsession tokenで認証し、サーバーが返したactorを確認する", async () => {
    const token = fixtureToken("convex");
    const { page, evaluate } = pageWithTokens(token);
    const operations = await invitationGroupOperationsForPage(page, actor);
    await expect(operations.getActor()).resolves.toBe(actor);
    expect(setAuth).toHaveBeenCalledWith(token);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(getFunctionName(query.mock.calls[0][0])).toBe("users/queries:getAuthenticatedUserId");
  });

  it("従来のJWT template構成でもconvex tokenを取得する", async () => {
    const { page, evaluate } = pageWithTokens(fixtureToken("session"), "fixture-convex-token");
    const operations = await invitationGroupOperationsForPage(page, actor);
    await operations.getActor();
    expect(evaluate.mock.calls[1][1]).toBe("convex");
    expect(setAuth).toHaveBeenCalledWith("fixture-convex-token");
  });

  it("session tokenがない場合はAPIを呼ばず失敗を伝播する", async () => {
    const { page } = pageWithTokens(null);
    const operations = await invitationGroupOperationsForPage(page, actor);
    await expect(operations.getActor()).rejects.toThrow("session is not available");
    expect(query).not.toHaveBeenCalled();
  });

  it("削除jobがcompletedになるまで確認し、完了を検証する", async () => {
    const { page } = pageWithTokens(fixtureToken("convex"));
    query.mockResolvedValue({ status: "completed" });
    const operations = await invitationGroupOperationsForPage(page, actor);
    await expect(operations.waitForDeletion(jobId)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    for (const [reference, args] of query.mock.calls) {
      expect(getFunctionName(reference)).toBe("groups/deletion:getGroupDeletionStatus");
      expect(args).toEqual({ jobId });
    }
  });

  it("削除jobがfailedなら成功扱いしない", async () => {
    const { page } = pageWithTokens(fixtureToken("convex"));
    query.mockResolvedValue({ status: "failed" });
    const operations = await invitationGroupOperationsForPage(page, actor);
    await expect(operations.waitForDeletion(jobId)).rejects.toThrow();
  });

  it("削除status取得失敗を隠さない", async () => {
    const { page } = pageWithTokens(fixtureToken("convex"));
    query.mockResolvedValue(null);
    const operations = await invitationGroupOperationsForPage(page, actor);
    await expect(operations.waitForDeletion(jobId)).rejects.toThrow(
      "deletion status is not available",
    );
  });
});
