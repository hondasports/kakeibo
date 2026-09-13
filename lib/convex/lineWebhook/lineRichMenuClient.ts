/**
 * LINE リッチメニュー適用クライアント（infrastructure adapter）。
 * scripts/apply-line-rich-menu.ts から直接利用される運用ツール。
 */
import { getLineIntegrationMode } from "../lineLink/lineIntegrationConfig";
import {
  LINE_RICH_MENU_NAME,
  buildLineRichMenuObject,
  validateLineRichMenuImage,
  type LineRichMenuObject,
} from "../../domain/lineSummary/richMenu";

const LINE_RICH_MENU_CREATE_ENDPOINT = "https://api.line.me/v2/bot/richmenu";
const LINE_RICH_MENU_LIST_ENDPOINT = "https://api.line.me/v2/bot/richmenu/list";
const LINE_RICH_MENU_CONTENT_ENDPOINT = "https://api-data.line.me/v2/bot/richmenu";
const LINE_RICH_MENU_DEFAULT_ENDPOINT = "https://api.line.me/v2/bot/user/all/richmenu";
const PROVIDER_TIMEOUT_MS = 10_000;
const MOCK_LINE_RICH_MENU_ID = "mock-rich-menu-id";

export type LineFetch = typeof fetch;

export type ApplyLineRichMenuResult = {
  dryRun: boolean;
  mode: "dry-run" | "mock" | "real";
  richMenuId: string | null;
  menu: LineRichMenuObject;
};

export type ApplyLineRichMenuOptions = {
  imageBytes: Uint8Array;
  dryRun?: boolean;
  fetchImpl?: LineFetch;
};

function toRequestBody(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function providerRejected(): Error {
  return new Error("LINE messaging provider rejected the rich menu");
}

function providerUnavailable(): Error {
  return new Error("LINE messaging provider is unavailable");
}

function readAccessToken(): string {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE messaging integration is unavailable");
  return accessToken;
}

function assertApplyAllowed(dryRun: boolean): void {
  if (dryRun) return;
  if (process.env.APP_ENV === "production") {
    throw new Error("LINE rich menu apply is not available in production");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRichMenuId(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.richMenuId !== "string") {
    throw providerRejected();
  }
  if (payload.richMenuId.length === 0 || payload.richMenuId.length > 256) {
    throw providerRejected();
  }
  return payload.richMenuId;
}

function readListedMenus(payload: unknown): Array<{ richMenuId: string; name: string }> {
  if (!isRecord(payload) || !Array.isArray(payload.richmenus)) {
    throw providerRejected();
  }
  return payload.richmenus.flatMap((item) => {
    if (!isRecord(item) || typeof item.richMenuId !== "string" || typeof item.name !== "string") {
      return [];
    }
    return [{ richMenuId: item.richMenuId, name: item.name }];
  });
}

async function lineRequest(
  fetchImpl: LineFetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw providerUnavailable();
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw providerRejected();
  }
}

export async function applyLineDefaultRichMenu(
  options: ApplyLineRichMenuOptions,
): Promise<ApplyLineRichMenuResult> {
  validateLineRichMenuImage(options.imageBytes);
  const dryRun = options.dryRun === true;
  assertApplyAllowed(dryRun);
  const menu = buildLineRichMenuObject();

  if (dryRun) {
    return { dryRun: true, mode: "dry-run", richMenuId: null, menu };
  }

  const mode = getLineIntegrationMode();
  if (mode === "mock") {
    return { dryRun: false, mode: "mock", richMenuId: MOCK_LINE_RICH_MENU_ID, menu };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const accessToken = readAccessToken();
  const jsonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const created = await lineRequest(fetchImpl, LINE_RICH_MENU_CREATE_ENDPOINT, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(menu),
  });
  if (!created.ok) throw providerRejected();
  const richMenuId = readRichMenuId(await readJson(created));

  const uploaded = await lineRequest(
    fetchImpl,
    `${LINE_RICH_MENU_CONTENT_ENDPOINT}/${richMenuId}/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/png",
      },
      body: toRequestBody(options.imageBytes),
    },
  );
  if (!uploaded.ok) throw providerRejected();

  const setDefault = await lineRequest(
    fetchImpl,
    `${LINE_RICH_MENU_DEFAULT_ENDPOINT}/${richMenuId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!setDefault.ok) throw providerRejected();

  const listed = await lineRequest(fetchImpl, LINE_RICH_MENU_LIST_ENDPOINT, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listed.ok) throw providerRejected();
  const staleMenus = readListedMenus(await readJson(listed)).filter(
    (item) => item.name === LINE_RICH_MENU_NAME && item.richMenuId !== richMenuId,
  );
  for (const stale of staleMenus) {
    const deleted = await lineRequest(
      fetchImpl,
      `${LINE_RICH_MENU_CREATE_ENDPOINT}/${stale.richMenuId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!deleted.ok) throw providerRejected();
  }

  return { dryRun: false, mode: "real", richMenuId, menu };
}
