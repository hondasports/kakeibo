import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { getAuthStateFromIdentity, requireAuthenticatedUserId } from "./auth";
import { createIdentity, createAuthContext } from "./testHelpers";

describe("requireAuthenticatedUserId", () => {
  it("throws ConvexError when the request is unauthenticated", async () => {
    await expect(requireAuthenticatedUserId(createAuthContext(null))).rejects.toMatchObject({
      data: "Not authenticated",
    });

    await expect(requireAuthenticatedUserId(createAuthContext(null))).rejects.toBeInstanceOf(
      ConvexError,
    );
  });

  it("returns identity.tokenIdentifier for an authenticated request", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user_123",
    });

    await expect(requireAuthenticatedUserId(createAuthContext(identity))).resolves.toBe(
      "https://issuer.example|user_123",
    );
  });

  it("does not use subject when tokenIdentifier is present", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|canonical-user-id",
      subject: "subject-only-user-id",
    });

    await expect(requireAuthenticatedUserId(createAuthContext(identity))).resolves.toBe(
      "https://issuer.example|canonical-user-id",
    );
  });
});

describe("getAuthStateFromIdentity", () => {
  it("returns an unauthenticated state when identity is null", () => {
    expect(getAuthStateFromIdentity(null)).toEqual({
      isAuthenticated: false,
      userId: null,
    });
  });

  it("returns an authenticated state with identity.tokenIdentifier", () => {
    expect(
      getAuthStateFromIdentity(
        createIdentity({
          tokenIdentifier: "https://issuer.example|user_456",
          subject: "subject-only-user-id",
        }),
      ),
    ).toEqual({
      isAuthenticated: true,
      userId: "https://issuer.example|user_456",
    });
  });
});
