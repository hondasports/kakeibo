/**
 * Convex Doc / ドメイン record の patch をメモリ上で組み立てるための純粋ヘルパー。
 * `ctx.db.patch` と同じセマンティクス（undefined はフィールド削除）に揃える。
 */

/** Convex値同士の deep-equal。plain object・配列・プリミティブを再帰比較する。 */
export function recordValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => recordValuesEqual(value, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined);
  const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => recordValuesEqual(aRecord[key], bRecord[key]))
  );
}

/**
 * patch を doc へメモリ上で適用した新しい record を返す。
 * `undefined` の値はキー削除として扱う（Convex patch 準拠）。
 */
export function applyRecordPatch<T extends Record<string, unknown>>(
  doc: T,
  patch: Record<string, unknown>,
): T {
  const next = { ...doc };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/**
 * patch のうち、doc の値を実際に変えるキーだけを抽出する。
 * 差分が timestampKeys のみ（= 内容差なし）なら null を返し、書き込み自体を省略できる。
 */
export function diffRecordPatch(
  doc: Record<string, unknown>,
  patch: Record<string, unknown>,
  timestampKeys: readonly string[] = ["updatedAt"],
): Record<string, unknown> | null {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!recordValuesEqual(doc[key], value)) {
      diff[key] = value;
    }
  }
  return Object.keys(diff).some((key) => !timestampKeys.includes(key)) ? diff : null;
}
