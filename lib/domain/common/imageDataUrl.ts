/**
 * 画像 data URL に関する共有ドメインルール。
 * Convex の string 値の 1MB 制限を下回る安全な最大長。
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 900_000;

export type ImageDataUrlError =
  | "invalid_format"
  | "missing_base64_marker"
  | "too_large"
  | "empty_base64"
  | "unsupported_mime_type"
  | "invalid_base64";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const BASE64_MARKER = ";base64,";

function isValidBase64(value: string): boolean {
  if (value.length === 0) return false;
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 61) {
      padding += 1;
      if (padding > 2) return false;
    } else {
      if (padding > 0) return false;
      if (
        !(code >= 65 && code <= 90) &&
        !(code >= 97 && code <= 122) &&
        !(code >= 48 && code <= 57) &&
        code !== 43 &&
        code !== 47
      ) {
        return false;
      }
    }
  }
  return value.length > padding;
}

/**
 * imageDataUrl の形式を検証する。
 * - "data:image/{jpeg,png,webp,gif};base64,..." の形式である必要がある
 * - 実際に base64 デコード可能な文字列である必要がある
 * - MAX_IMAGE_DATA_URL_LENGTH 文字以内である必要がある
 */
const imageDataUrlErrorMessages: Record<ImageDataUrlError, string> = {
  invalid_format: "imageDataUrl は Data URL 形式で指定してください",
  missing_base64_marker: "imageDataUrl は base64 エンコードされた Data URL 形式で指定してください",
  too_large:
    "画像サイズが大きすぎます。長辺 1400〜1800px・JPEG にリサイズしてから再試行してください",
  empty_base64: "imageDataUrl の base64 データが空です",
  unsupported_mime_type: "対応していない画像形式です。JPEG / PNG / WebP / GIF を使用してください",
  invalid_base64: "imageDataUrl の base64 エンコーディングが不正です",
};

/** imageDataUrl 検証エラーをユーザー向けメッセージに変換する */
export function getImageDataUrlErrorMessage(error: ImageDataUrlError): string {
  return imageDataUrlErrorMessages[error];
}

export function validateImageDataUrl(
  imageDataUrl: string,
): { success: true } | { success: false; error: ImageDataUrlError } {
  if (!imageDataUrl.startsWith("data:")) {
    return { success: false, error: "invalid_format" };
  }

  const markerIndex = imageDataUrl.indexOf(BASE64_MARKER);
  if (markerIndex === -1) {
    return { success: false, error: "missing_base64_marker" };
  }

  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return { success: false, error: "too_large" };
  }

  const header = imageDataUrl.slice(5, markerIndex);
  const base64Body = imageDataUrl.slice(markerIndex + BASE64_MARKER.length);
  if (base64Body.length === 0) {
    return { success: false, error: "empty_base64" };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(header.toLowerCase())) {
    return { success: false, error: "unsupported_mime_type" };
  }

  if (!isValidBase64(base64Body)) {
    return { success: false, error: "invalid_base64" };
  }

  return { success: true };
}
