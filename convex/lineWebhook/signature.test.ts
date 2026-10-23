import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "../../lib/domain/lineWebhook/signature";

async function createSignature(rawBody: Uint8Array, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign({ name: "HMAC" }, key, rawBody);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

describe("verifyLineSignature", () => {
  it("JSON parse前のraw bodyに対するHMAC-SHA256を検証する", async () => {
    const rawBody = new TextEncoder().encode('{"events":[{"type":"follow"}]}');
    const signature = await createSignature(rawBody, "channel-secret");

    await expect(verifyLineSignature(rawBody, signature, "channel-secret")).resolves.toBe(true);
    const changedBody = new TextEncoder().encode(`${new TextDecoder().decode(rawBody)} `);
    await expect(verifyLineSignature(changedBody, signature, "channel-secret")).resolves.toBe(
      false,
    );
    await expect(verifyLineSignature(rawBody, signature, "wrong-secret")).resolves.toBe(false);
  });

  it("署名欠落・不正base64・長さ不正を拒否する", async () => {
    const rawBody = new TextEncoder().encode("{}");
    await expect(verifyLineSignature(rawBody, "", "secret")).resolves.toBe(false);
    await expect(verifyLineSignature(rawBody, "not-base64", "secret")).resolves.toBe(false);
    await expect(verifyLineSignature(rawBody, "AAAA", "secret")).resolves.toBe(false);
  });
});
