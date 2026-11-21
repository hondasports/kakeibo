import { MAX_IMAGE_DATA_URL_LENGTH } from "../common/imageDataUrl";

export type LineImageContent = {
  bytes: Uint8Array;
  contentType: string;
};

type LineImageDataUrlError = "empty" | "unsupported_mime_type" | "too_large";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DATA_URL_BASE64_PREFIX_SUFFIX = ";base64,";
const LONGEST_DATA_URL_PREFIX_LENGTH = Math.max(
  ...[...ALLOWED_IMAGE_MIME_TYPES].map(
    (mime) => `data:${mime}${DATA_URL_BASE64_PREFIX_SUFFIX}`.length,
  ),
);

/** Data URL 上限に収まる生バイト数。 */
export const MAX_LINE_IMAGE_RAW_BYTES = Math.floor(
  ((MAX_IMAGE_DATA_URL_LENGTH - LONGEST_DATA_URL_PREFIX_LENGTH) * 3) / 4,
);

export class LineImageContentTooLargeError extends Error {
  constructor(message = "LINE image exceeds the Data URL size limit") {
    super(message);
    this.name = "LineImageContentTooLargeError";
  }
}

function encodedDataUrlLength(byteLength: number, mime: string): number {
  return `data:${mime}${DATA_URL_BASE64_PREFIX_SUFFIX}`.length + Math.ceil(byteLength / 3) * 4;
}

export function normalizeImageContentType(contentType: string): string | null {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/jpg") return "image/jpeg";
  if (ALLOWED_IMAGE_MIME_TYPES.has(mime)) return mime;
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function toImageDataUrl(
  content: LineImageContent,
): { ok: true; dataUrl: string } | { ok: false; error: LineImageDataUrlError } {
  if (content.bytes.byteLength === 0) {
    return { ok: false, error: "empty" };
  }

  const mime = normalizeImageContentType(content.contentType);
  if (mime === null) {
    return { ok: false, error: "unsupported_mime_type" };
  }

  if (encodedDataUrlLength(content.bytes.byteLength, mime) > MAX_IMAGE_DATA_URL_LENGTH) {
    return { ok: false, error: "too_large" };
  }

  return {
    ok: true,
    dataUrl: `data:${mime}${DATA_URL_BASE64_PREFIX_SUFFIX}${bytesToBase64(content.bytes)}`,
  };
}
