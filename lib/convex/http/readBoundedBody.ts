/**
 * HTTP リクエスト body をサイズ上限付きでストリーム読み込みする。
 * 署名検証より前に呼び、上限超過時は読み込みを打ち切って tooLarge を返す。
 * Content-Length は偽装・省略され得るため、実際に受信したバイト数で判定する。
 */
export async function readBoundedBody(
  req: Request,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; tooLarge: boolean }> {
  if (!req.body) return { bytes: new Uint8Array(), tooLarge: false };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("webhook payload too large");
        } catch {
          // 読み込み停止が既に完了している場合も tooLarge を返す。
        }
        return { bytes: new Uint8Array(), tooLarge: true };
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, tooLarge: false };
}
