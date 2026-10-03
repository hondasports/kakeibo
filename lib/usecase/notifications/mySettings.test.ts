import { describe, expect, it, vi } from "vitest";
import { getMyNotificationSettings, updateMyNotificationPreference } from "./mySettings";

function makeUser(prefs?: {
  aiReviewRequiredEmailEnabled?: boolean;
  aiReviewRequiredLineEnabled?: boolean;
}) {
  return {
    id: "doc-1",
    userId: "user-1",
    displayName: "u",
    createdAt: 0,
    updatedAt: 0,
    ...(prefs ? { notificationPreferences: prefs } : {}),
  };
}

function makeQueryDeps({
  user = makeUser(),
  links = [],
  emailGlobal,
  lineGlobal,
  deletionRequests = [],
}: {
  user?: unknown;
  links?: unknown[];
  emailGlobal?: boolean;
  lineGlobal?: boolean;
  deletionRequests?: { status: string }[];
} = {}) {
  return {
    settings: {
      findByTypeAndChannel: vi.fn((_type: string, channel: string) =>
        Promise.resolve(
          channel === "email"
            ? emailGlobal === undefined
              ? null
              : { enabled: emailGlobal }
            : lineGlobal === undefined
              ? null
              : { enabled: lineGlobal },
        ),
      ),
      listAll: vi.fn().mockResolvedValue([]),
    },
    users: { findByUserId: vi.fn().mockResolvedValue(user) },
    links: {
      listActiveByUserId: vi.fn().mockResolvedValue(links),
      findLatestActiveByUserId: vi.fn().mockResolvedValue(links[0] ?? null),
    },
    accountDeletionRequests: { listByUser: vi.fn().mockResolvedValue(deletionRequests) },
  } as never;
}

describe("getMyNotificationSettings", () => {
  it("returns defaults: email on, line off, unlinked", async () => {
    const result = await getMyNotificationSettings(makeQueryDeps(), "user-1");
    expect(result).toEqual({
      emailEnabled: true,
      lineEnabled: false,
      lineLinked: false,
      emailGloballyEnabled: true,
      lineGloballyEnabled: false,
    });
  });

  it("reflects stored preferences and link status", async () => {
    const result = await getMyNotificationSettings(
      makeQueryDeps({
        user: makeUser({
          aiReviewRequiredEmailEnabled: false,
          aiReviewRequiredLineEnabled: true,
        }),
        links: [{ id: "link-1" }],
        emailGlobal: false,
        lineGlobal: true,
      }),
      "user-1",
    );
    expect(result).toEqual({
      emailEnabled: false,
      lineEnabled: true,
      lineLinked: true,
      emailGloballyEnabled: false,
      lineGloballyEnabled: true,
    });
  });

  it("rejects missing and deleting users", async () => {
    await expect(
      getMyNotificationSettings(makeQueryDeps({ user: null }), "user-1"),
    ).rejects.toThrow();
    await expect(
      getMyNotificationSettings(
        makeQueryDeps({ deletionRequests: [{ status: "requested" }] }),
        "user-1",
      ),
    ).rejects.toThrow();
  });
});

describe("updateMyNotificationPreference", () => {
  function makeMutationDeps({
    user = makeUser(),
    links = [],
    deletionRequests = [],
  }: {
    user?: unknown;
    links?: unknown[];
    deletionRequests?: { status: string }[];
  } = {}) {
    const patch = vi.fn().mockResolvedValue(undefined);
    return {
      deps: {
        users: { findByUserId: vi.fn().mockResolvedValue(user), patch },
        links: { listActiveByUserId: vi.fn().mockResolvedValue(links) },
        accountDeletionRequests: { listByUser: vi.fn().mockResolvedValue(deletionRequests) },
      } as never,
      patch,
    };
  }

  it("toggles email while preserving line preference", async () => {
    const { deps, patch } = makeMutationDeps({
      user: makeUser({ aiReviewRequiredLineEnabled: true }),
    });
    const result = await updateMyNotificationPreference(
      deps,
      "user-1",
      { channel: "email", enabled: false },
      123,
    );
    expect(result).toEqual({ emailEnabled: false, lineEnabled: true });
    expect(patch).toHaveBeenCalledWith("doc-1", {
      notificationPreferences: {
        aiReviewRequiredEmailEnabled: false,
        aiReviewRequiredLineEnabled: true,
      },
      updatedAt: 123,
    });
  });

  it("enables line only when exactly one active link exists", async () => {
    const { deps: noLink } = makeMutationDeps({ links: [] });
    await expect(
      updateMyNotificationPreference(noLink, "user-1", { channel: "line", enabled: true }, 1),
    ).rejects.toThrow();

    const { deps: twoLinks } = makeMutationDeps({ links: [{ id: "a" }, { id: "b" }] });
    await expect(
      updateMyNotificationPreference(twoLinks, "user-1", { channel: "line", enabled: true }, 1),
    ).rejects.toThrow();

    const { deps: oneLink, patch } = makeMutationDeps({ links: [{ id: "a" }] });
    const result = await updateMyNotificationPreference(
      oneLink,
      "user-1",
      { channel: "line", enabled: true },
      1,
    );
    expect(result.lineEnabled).toBe(true);
    expect(patch).toHaveBeenCalled();
  });

  it("allows disabling line even when unlinked", async () => {
    const { deps } = makeMutationDeps({
      user: makeUser({ aiReviewRequiredLineEnabled: true }),
      links: [],
    });
    const result = await updateMyNotificationPreference(
      deps,
      "user-1",
      { channel: "line", enabled: false },
      1,
    );
    expect(result.lineEnabled).toBe(false);
  });

  it("rejects deleting users", async () => {
    const { deps } = makeMutationDeps({ deletionRequests: [{ status: "requested" }] });
    await expect(
      updateMyNotificationPreference(deps, "user-1", { channel: "email", enabled: false }, 1),
    ).rejects.toThrow();
  });
});
