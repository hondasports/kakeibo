import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "@playwright/test";

export const vercelBypassStatePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.tmp/vercel-bypass.json",
);

export async function prepareVercelBypassState(
  baseURL: string,
  bypassSecret: string,
  statePath = vercelBypassStatePath,
) {
  const origin = new URL(baseURL).origin;
  const client = await request.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const response = await client
      .get(origin, {
        headers: {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        },
        maxRedirects: 0,
        timeout: 30_000,
      })
      .catch(() => {
        // 元例外にはリクエストヘッダーが含まれるため引き継がない。
        throw new Error("Vercel protection setup request failed.");
      });
    if (response.status() >= 400) {
      throw new Error(`Vercel protection setup failed (${response.status()}).`);
    }
    const state = await client.storageState();
    const hostname = new URL(origin).hostname;
    const cookies = state.cookies.filter(
      (cookie) => cookie.name === "_vercel_jwt" && cookie.domain === hostname,
    );
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
  } finally {
    await client.dispose();
  }
}
